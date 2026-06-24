"""PyInstaller entry point for the bundled backend.

Runs uvicorn programmatically with the already-imported FastAPI ``app`` object
(not the "main:app" import string), which avoids dynamic-import issues inside a
frozen executable. Host/port match what Electron expects.
"""

import os

import uvicorn

from main import app

if __name__ == "__main__":
    host = os.environ.get("VPS_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("VPS_BACKEND_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")
