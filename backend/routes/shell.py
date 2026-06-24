"""Interactive SSH shell over a WebSocket.

Each WebSocket connection opens its own ``invoke_shell`` PTY channel on the
shared Paramiko session, so multiple terminals can run simultaneously. A reader
thread pumps bytes from the SSH channel to the socket; the socket's receive
loop forwards input/resize messages to the channel.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ssh_client import NotConnectedError, get_client

router = APIRouter(tags=["shell"])

# Size of reads from the SSH channel.
READ_SIZE = 32 * 1024


@router.websocket("/shell")
async def shell(ws: WebSocket):
    await ws.accept()

    # Require an active SSH session.
    try:
        client = get_client()
    except NotConnectedError as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close()
        return

    # Open a dedicated PTY channel for this connection.
    try:
        channel = client.client.invoke_shell(term="xterm-256color")
    except Exception as exc:  # noqa: BLE001 - surface any Paramiko failure
        await ws.send_json({"type": "error", "message": f"Failed to open shell: {exc}"})
        await ws.close()
        return

    channel.settimeout(0.0)  # non-blocking reads in the reader thread
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    async def pump_channel_to_ws():
        """Forward SSH channel output to the WebSocket as raw text."""
        try:
            while not stop.is_set():
                if channel.recv_ready():
                    # recv is non-blocking (timeout 0); run in executor to avoid
                    # blocking the event loop on larger reads.
                    data = await loop.run_in_executor(None, channel.recv, READ_SIZE)
                    if data == b"":
                        break  # channel closed by remote
                    await ws.send_text(data.decode("utf-8", errors="replace"))
                elif channel.exit_status_ready() and not channel.recv_ready():
                    break
                else:
                    await asyncio.sleep(0.01)
        except Exception:
            pass
        finally:
            stop.set()
            # The shell ended (e.g. user typed `exit`) — tell the client.
            try:
                await ws.send_json({"type": "exit", "message": "Shell session ended"})
            except Exception:
                pass

    reader_task = asyncio.create_task(pump_channel_to_ws())

    try:
        while not stop.is_set():
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            mtype = msg.get("type")
            if mtype == "input":
                channel.send(msg.get("data", ""))
            elif mtype == "resize":
                cols = int(msg.get("cols", 80))
                rows = int(msg.get("rows", 24))
                channel.resize_pty(width=cols, height=rows)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        stop.set()
        reader_task.cancel()
        try:
            channel.close()
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass
