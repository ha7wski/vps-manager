"""File operations over SFTP: list, read, write, rename, move, delete, mkdir,
upload, download.

All endpoints require an active SSH session. SFTP/OS errors are translated to
HTTP status codes (404 / 403 / 400) with a human-readable ``detail`` message.
"""

from __future__ import annotations

import errno
import posixpath
import stat
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ssh_client import NotConnectedError, get_client

router = APIRouter(prefix="/files", tags=["files"])

# Chunk size for streaming uploads/downloads.
CHUNK = 32 * 1024


# --- error translation -------------------------------------------------------


def _http_from_os_error(exc: Exception, path: str) -> HTTPException:
    """Map an SFTP/OS error to an HTTPException with a clear message."""
    err = getattr(exc, "errno", None)
    if isinstance(exc, FileNotFoundError) or err == errno.ENOENT:
        return HTTPException(404, detail=f"No such file or directory: {path}")
    if isinstance(exc, PermissionError) or err == errno.EACCES:
        return HTTPException(403, detail=f"Permission denied: {path}")
    if isinstance(exc, FileExistsError) or err == errno.EEXIST:
        return HTTPException(400, detail=f"Already exists: {path}")
    if isinstance(exc, NotADirectoryError) or err == errno.ENOTDIR:
        return HTTPException(400, detail=f"Not a directory: {path}")
    # Generic IOError from paramiko with no recognizable errno.
    return HTTPException(400, detail=f"Operation failed on {path}: {exc}")


def _require_client():
    try:
        return get_client()
    except NotConnectedError as exc:
        raise HTTPException(409, detail=str(exc)) from exc


def _entry_type(mode: int) -> str:
    if stat.S_ISLNK(mode):
        return "link"
    if stat.S_ISDIR(mode):
        return "dir"
    return "file"


def _validate_path(path: str) -> str:
    if not path or not path.startswith("/"):
        raise HTTPException(400, detail="Path must be a non-empty absolute path")
    return path


# --- request models ----------------------------------------------------------


class WriteRequest(BaseModel):
    path: str = Field(..., min_length=1)
    content: str


class RenameRequest(BaseModel):
    path: str = Field(..., min_length=1)
    new_name: str = Field(..., min_length=1)


class MoveRequest(BaseModel):
    source: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)


class DeleteRequest(BaseModel):
    path: str = Field(..., min_length=1)
    recursive: bool = False


class MkdirRequest(BaseModel):
    path: str = Field(..., min_length=1)


# --- endpoints ---------------------------------------------------------------


@router.get("/list")
def list_dir(path: str = Query("/")):
    """List the contents of a directory."""
    _validate_path(path)
    client = _require_client()

    try:
        with client.sftp_session() as sftp:
            attrs = sftp.listdir_attr(path)
    except OSError as exc:
        raise _http_from_os_error(exc, path) from exc

    items = []
    for a in attrs:
        mode = a.st_mode or 0
        items.append(
            {
                "name": a.filename,
                "type": _entry_type(mode),
                "size": a.st_size or 0,
                "permissions": stat.filemode(mode),
                "modified": (
                    datetime.fromtimestamp(a.st_mtime).isoformat() if a.st_mtime else None
                ),
                "is_hidden": a.filename.startswith("."),
            }
        )

    # Directories first, then alphabetical (case-insensitive).
    items.sort(key=lambda i: (i["type"] != "dir", i["name"].lower()))
    return {"path": path, "items": items}


@router.get("/read")
def read_file(path: str = Query(...)):
    """Read a UTF-8 text file. Returns 400 for binary content."""
    _validate_path(path)
    client = _require_client()

    try:
        with client.sftp_session() as sftp, sftp.open(path, "rb") as f:
            data = f.read()
    except OSError as exc:
        raise _http_from_os_error(exc, path) from exc

    if b"\x00" in data:
        raise HTTPException(400, detail="Cannot open binary file as text")
    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, detail="File is not valid UTF-8 text") from exc

    return {"path": path, "content": content}


@router.post("/write")
def write_file(req: WriteRequest):
    """Write (create or overwrite) a text file via SFTP."""
    _validate_path(req.path)
    client = _require_client()
    try:
        with client.sftp_session() as sftp, sftp.open(req.path, "w") as f:
            f.write(req.content)
    except OSError as exc:
        raise _http_from_os_error(exc, req.path) from exc
    return {"status": "saved", "path": req.path}


@router.post("/rename")
def rename(req: RenameRequest):
    """Rename a file/dir in place (new_name is a bare name, not a path)."""
    _validate_path(req.path)
    if "/" in req.new_name:
        raise HTTPException(400, detail="new_name must not contain a path separator")
    client = _require_client()
    new_path = posixpath.join(posixpath.dirname(req.path.rstrip("/")), req.new_name)
    try:
        with client.sftp_session() as sftp:
            sftp.posix_rename(req.path, new_path)
    except OSError as exc:
        raise _http_from_os_error(exc, req.path) from exc
    return {"status": "renamed", "new_path": new_path}


@router.post("/move")
def move(req: MoveRequest):
    """Move/relocate source to destination (overwrites if allowed)."""
    _validate_path(req.source)
    _validate_path(req.destination)
    client = _require_client()
    try:
        with client.sftp_session() as sftp:
            sftp.posix_rename(req.source, req.destination)
    except OSError as exc:
        raise _http_from_os_error(exc, req.source) from exc
    return {"status": "moved", "source": req.source, "destination": req.destination}


def _rmtree(sftp, path: str) -> None:
    """Recursively delete a directory tree over SFTP."""
    for entry in sftp.listdir_attr(path):
        child = posixpath.join(path, entry.filename)
        if stat.S_ISDIR(entry.st_mode or 0):
            _rmtree(sftp, child)
        else:
            sftp.remove(child)
    sftp.rmdir(path)


@router.post("/delete")
def delete(req: DeleteRequest):
    """Delete a file or directory. Directories require recursive=true."""
    _validate_path(req.path)
    client = _require_client()
    try:
        with client.sftp_session() as sftp:
            attr = sftp.lstat(req.path)
            if stat.S_ISDIR(attr.st_mode or 0):
                if req.recursive:
                    _rmtree(sftp, req.path)
                else:
                    sftp.rmdir(req.path)  # fails if not empty
            else:
                sftp.remove(req.path)
    except OSError as exc:
        raise _http_from_os_error(exc, req.path) from exc
    return {"status": "deleted", "path": req.path}


@router.post("/mkdir")
def mkdir(req: MkdirRequest):
    """Create a new directory."""
    _validate_path(req.path)
    client = _require_client()
    try:
        with client.sftp_session() as sftp:
            sftp.mkdir(req.path)
    except OSError as exc:
        raise _http_from_os_error(exc, req.path) from exc
    return {"status": "created", "path": req.path}


@router.post("/upload")
async def upload(file: UploadFile = File(...), destination_dir: str = Form(...)):
    """Upload a file into destination_dir via SFTP (streamed in chunks)."""
    _validate_path(destination_dir)
    client = _require_client()
    remote_path = posixpath.join(destination_dir, file.filename)
    # Dedicated channel: this is an async handler, so it can't safely hold the
    # shared channel's threading lock across `await`.
    sftp = client.open_sftp()
    try:
        with sftp.open(remote_path, "wb") as remote:
            remote.set_pipelined(True)
            while True:
                chunk = await file.read(CHUNK)
                if not chunk:
                    break
                remote.write(chunk)
    except OSError as exc:
        raise _http_from_os_error(exc, remote_path) from exc
    finally:
        await file.close()
        sftp.close()
    return {"status": "uploaded", "path": remote_path}


@router.get("/download")
def download(path: str = Query(...)):
    """Stream a remote file back to the client as an attachment."""
    _validate_path(path)
    client = _require_client()

    # Validate existence/permissions up front so errors surface as proper codes
    # (a generator raising mid-stream would not produce a clean HTTP error).
    try:
        with client.sftp_session() as sftp:
            attr = sftp.stat(path)
            if stat.S_ISDIR(attr.st_mode or 0):
                raise HTTPException(400, detail=f"Cannot download a directory: {path}")
    except OSError as exc:
        raise _http_from_os_error(exc, path) from exc

    def iter_file():
        # Dedicated channel so a long download doesn't hold the shared lock.
        dl = client.open_sftp()
        try:
            with dl.open(path, "rb") as f:
                f.prefetch(attr.st_size or 0)
                while True:
                    chunk = f.read(CHUNK)
                    if not chunk:
                        break
                    yield chunk
        finally:
            dl.close()

    filename = posixpath.basename(path)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if attr.st_size:
        headers["Content-Length"] = str(attr.st_size)
    return StreamingResponse(iter_file(), media_type="application/octet-stream", headers=headers)
