"""Singleton SSH/SFTP client shared across all backend routes.

Holds one Paramiko SSH connection and a lazily-opened SFTP session. The
password is passed in at connect time and kept in memory only — it is never
written to disk or stored beyond the live transport.

Usage:
    from ssh_client import ssh_client, get_client

    ssh_client.connect(host, port, username, password)
    client = get_client()          # raises NotConnectedError if not connected
    stdout = client.run("uptime")
"""

from __future__ import annotations

import socket
import threading
from contextlib import contextmanager

import paramiko


# Default timeout (seconds) for establishing the TCP/SSH connection.
CONNECT_TIMEOUT = 10


class NotConnectedError(Exception):
    """Raised when an operation needs an active SSH session but none exists."""


class AuthenticationError(Exception):
    """Raised when the username/password is rejected by the server."""


class ConnectionFailedError(Exception):
    """Raised when the host is unreachable, times out, or the SSH handshake fails."""


class SSHClientSingleton:
    """Wraps a single Paramiko SSHClient + SFTP session.

    Thread-safe for connect/disconnect; route handlers share the same instance.
    """

    def __init__(self) -> None:
        self._client: paramiko.SSHClient | None = None
        self._sftp: paramiko.SFTPClient | None = None
        self._lock = threading.Lock()
        # Paramiko's SFTPClient is NOT safe for concurrent use from multiple
        # threads (FastAPI runs sync endpoints in a threadpool). Serialize all
        # access to the shared SFTP channel with this lock.
        self._sftp_lock = threading.RLock()

        # Connection metadata (no password) for status reporting.
        self.host: str | None = None
        self.port: int | None = None
        self.username: str | None = None
        # Absolute home directory of the SSH user, resolved at connect time.
        self.home: str | None = None

    # -- lifecycle ---------------------------------------------------------

    def connect(self, host: str, port: int, username: str, password: str) -> None:
        """Open an SSH connection and SFTP session.

        Raises:
            AuthenticationError: credentials rejected.
            ConnectionFailedError: host unreachable, timeout, or handshake error.
        """
        with self._lock:
            # Drop any previous session before reconnecting.
            self._close_locked()

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            try:
                client.connect(
                    hostname=host,
                    port=port,
                    username=username,
                    password=password,
                    timeout=CONNECT_TIMEOUT,
                    banner_timeout=CONNECT_TIMEOUT,
                    auth_timeout=CONNECT_TIMEOUT,
                    look_for_keys=False,
                    allow_agent=False,
                )
            except paramiko.AuthenticationException as exc:
                client.close()
                raise AuthenticationError("Authentication failed: wrong username or password") from exc
            except (socket.timeout, paramiko.ssh_exception.NoValidConnectionsError) as exc:
                client.close()
                raise ConnectionFailedError(f"Could not reach {host}:{port} — host unreachable or timed out") from exc
            except (paramiko.SSHException, socket.error, OSError) as exc:
                client.close()
                raise ConnectionFailedError(f"SSH connection failed: {exc}") from exc

            # Open SFTP up front so file routes can rely on it being present.
            try:
                sftp = client.open_sftp()
            except paramiko.SSHException as exc:
                client.close()
                raise ConnectionFailedError(f"Connected but failed to open SFTP: {exc}") from exc

            # Resolve the user's home directory: the SFTP working directory
            # starts at $HOME, so normalizing "." yields its absolute path.
            # Fall back to "/" if the server rejects the request.
            try:
                home = sftp.normalize(".")
            except (paramiko.SSHException, OSError):
                home = "/"

            self._client = client
            self._sftp = sftp
            self.host = host
            self.port = port
            self.username = username
            self.home = home

    def disconnect(self) -> None:
        """Close SFTP and SSH cleanly. Safe to call when already disconnected."""
        with self._lock:
            self._close_locked()

    def _close_locked(self) -> None:
        """Tear down sessions. Caller must hold the lock."""
        if self._sftp is not None:
            try:
                self._sftp.close()
            except Exception:
                pass
            self._sftp = None

        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None

        self.host = None
        self.port = None
        self.username = None
        self.home = None

    # -- accessors ---------------------------------------------------------

    def is_connected(self) -> bool:
        """Return True if the SSH transport is active."""
        if self._client is None:
            return False
        transport = self._client.get_transport()
        return transport is not None and transport.is_active()

    @property
    def client(self) -> paramiko.SSHClient:
        if not self.is_connected() or self._client is None:
            raise NotConnectedError("Not connected to any VPS")
        return self._client

    @property
    def sftp(self) -> paramiko.SFTPClient:
        if not self.is_connected() or self._sftp is None:
            raise NotConnectedError("Not connected to any VPS")
        return self._sftp

    @contextmanager
    def sftp_session(self):
        """Yield the shared SFTP client under a lock so concurrent requests are
        serialized (Paramiko SFTP is not concurrency-safe)."""
        with self._sftp_lock:
            yield self.sftp

    def open_sftp(self) -> paramiko.SFTPClient:
        """Open a dedicated, independent SFTP channel (caller must close it).

        Used for long-running streams (downloads) so they don't hold the shared
        channel's lock for their whole duration. Opening a channel is safe to do
        concurrently — Paramiko serializes transport-level channel creation.
        """
        return self.client.open_sftp()

    # -- operations --------------------------------------------------------

    def run(self, command: str, timeout: int = 30) -> tuple[str, str, int]:
        """Run a command over SSH; return (stdout, stderr, exit_status)."""
        _stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        exit_status = stdout.channel.recv_exit_status()
        return out, err, exit_status


# Module-level singleton shared by all routes.
ssh_client = SSHClientSingleton()


def get_client() -> SSHClientSingleton:
    """Return the shared client, raising NotConnectedError if not connected."""
    if not ssh_client.is_connected():
        raise NotConnectedError("Not connected to any VPS")
    return ssh_client
