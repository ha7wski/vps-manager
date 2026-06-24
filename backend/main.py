"""VPS Manager backend entry point.

FastAPI application that proxies SSH/SFTP operations to a remote VPS.
Bound to localhost only — never expose this on a public interface.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Routers are wired in as each module is implemented (steps 2..9).
from routes import connection, files, shell, system, logs

app = FastAPI(title="VPS Manager Backend", version="0.1.0")

# Electron loads the frontend from the Vite dev server (5173) in dev and from
# a file:// origin in production. Allow localhost origins broadly since the
# server is bound to localhost only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Liveness probe used by Electron to know when the backend is ready."""
    return {"status": "ok"}


app.include_router(connection.router)
app.include_router(files.router)
app.include_router(shell.router)
app.include_router(system.router)
app.include_router(logs.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
