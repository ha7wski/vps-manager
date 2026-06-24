"""Real-time log streaming over WebSocket (tail -f equivalent) plus a helper
that lists which common Ubuntu log files actually exist on the VPS.

Each WebSocket runs its own `tail` process on a dedicated SSH channel, so many
clients can tail different files independently. Killing the channel terminates
the remote `tail` when the socket closes.
"""

from __future__ import annotations

import asyncio
import json
import shlex

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ssh_client import NotConnectedError, get_client

router = APIRouter(tags=["logs"])

READ_SIZE = 32 * 1024

# Common Ubuntu log files to probe for existence.
COMMON_LOGS = [
    "/var/log/syslog",
    "/var/log/auth.log",
    "/var/log/kern.log",
    "/var/log/dpkg.log",
    "/var/log/messages",
    "/var/log/cloud-init.log",
    "/var/log/cloud-init-output.log",
    "/var/log/ufw.log",
    "/var/log/fail2ban.log",
    "/var/log/nginx/access.log",
    "/var/log/nginx/error.log",
    "/var/log/apache2/access.log",
    "/var/log/apache2/error.log",
    "/var/log/mysql/error.log",
    "/var/log/redis/redis-server.log",
    "/var/log/docker.log",
]


@router.get("/logs/list")
def list_logs():
    """Return the subset of COMMON_LOGS that exist and are readable."""
    try:
        client = get_client()
    except NotConnectedError as exc:
        raise HTTPException(409, detail=str(exc)) from exc

    # Test all candidates in one command: print each readable path.
    quoted = " ".join(shlex.quote(p) for p in COMMON_LOGS)
    cmd = f'for f in {quoted}; do if [ -r "$f" ]; then echo "$f"; fi; done'
    out, _err, _code = client.run(cmd, timeout=15)
    existing = [line.strip() for line in out.splitlines() if line.strip()]
    return {"logs": existing}


@router.websocket("/logs")
async def logs(ws: WebSocket):
    await ws.accept()

    # Require an active SSH session.
    try:
        client = get_client()
    except NotConnectedError as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close()
        return

    # First client message selects the file and initial line count.
    try:
        first = await ws.receive_text()
        cfg = json.loads(first)
    except (WebSocketDisconnect, json.JSONDecodeError):
        await ws.close()
        return

    path = cfg.get("path")
    lines = int(cfg.get("lines", 200))
    if not path or not isinstance(path, str):
        await ws.send_json({"type": "error", "message": "No log path provided"})
        await ws.close()
        return

    # Verify the file exists and is readable up front for a clean error.
    check_out, _err, _code = client.run(
        f'if [ ! -e {shlex.quote(path)} ]; then echo MISSING; '
        f'elif [ ! -r {shlex.quote(path)} ]; then echo NOREAD; else echo OK; fi'
    )
    verdict = check_out.strip()
    if verdict == "MISSING":
        await ws.send_json({"type": "error", "message": f"File not found: {path}"})
        await ws.close()
        return
    if verdict == "NOREAD":
        await ws.send_json({"type": "error", "message": f"Permission denied reading: {path}"})
        await ws.close()
        return

    # Open a dedicated channel and run tail -n <lines> -F <path>.
    # -F (capital) keeps following across log rotation.
    channel = client.client.get_transport().open_session()
    channel.settimeout(0.0)
    tail_cmd = f"tail -n {lines} -F {shlex.quote(path)}"
    channel.exec_command(tail_cmd)

    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    await ws.send_json({"type": "status", "status": "live", "path": path})

    async def pump():
        try:
            while not stop.is_set():
                if channel.recv_ready():
                    data = await loop.run_in_executor(None, channel.recv, READ_SIZE)
                    if data == b"":
                        break
                    await ws.send_text(data.decode("utf-8", errors="replace"))
                elif channel.exit_status_ready() and not channel.recv_ready():
                    break
                else:
                    await asyncio.sleep(0.05)
        except Exception:
            pass
        finally:
            stop.set()
            try:
                await ws.send_json({"type": "status", "status": "ended"})
            except Exception:
                pass

    pump_task = asyncio.create_task(pump())

    try:
        # We don't expect further input, but keep receiving to detect disconnect
        # and allow a future "change file" message.
        while not stop.is_set():
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stop.set()
        pump_task.cancel()
        # Closing the channel terminates the remote tail process.
        try:
            channel.close()
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass
