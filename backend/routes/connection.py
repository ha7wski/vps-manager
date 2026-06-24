"""Connection routes: /connect, /disconnect, /status.

The password is received over localhost only, used to open the Paramiko
session, and never persisted.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ssh_client import (
    AuthenticationError,
    ConnectionFailedError,
    ssh_client,
)

router = APIRouter(tags=["connection"])


class ConnectRequest(BaseModel):
    host: str = Field(..., min_length=1)
    port: int = Field(22, ge=1, le=65535)
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


@router.post("/connect")
def connect(req: ConnectRequest):
    """Open an SSH + SFTP session to the VPS."""
    try:
        ssh_client.connect(req.host, req.port, req.username, req.password)
    except AuthenticationError as exc:
        # 401: credentials rejected.
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ConnectionFailedError as exc:
        # 503: host unreachable / timeout / handshake failure.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "status": "connected",
        "host": ssh_client.host,
        "username": ssh_client.username,
    }


@router.post("/disconnect")
def disconnect():
    """Close the SSH + SFTP session cleanly."""
    ssh_client.disconnect()
    return {"status": "disconnected"}


@router.get("/status")
def status():
    """Report whether a session is active and to which host/user."""
    connected = ssh_client.is_connected()
    return {
        "connected": connected,
        "host": ssh_client.host if connected else None,
        "username": ssh_client.username if connected else None,
    }
