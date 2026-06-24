# VPS Manager

A single-user macOS desktop application to manage a remote Ubuntu VPS over
SSH/SFTP — files, an interactive terminal, system metrics, and live logs, all
in one native app.

**Stack:** Electron + React + Vite + Tailwind (frontend) · FastAPI + Paramiko
(backend) · packaged for macOS with electron-builder + PyInstaller.

---

## Architecture

```
┌───────────────────────────────────────────────┐
│ Electron (main process)                        │
│  • spawns the backend (frozen exe in prod)     │
│  • resolves a free backend port, opens window  │
│  • App menu + About window                     │
└───────────────┬────────────────────────────────┘
                │ loads
┌───────────────▼────────────────────────────────┐
│ React renderer (Vite build)                     │
│  Sidebar · Files · Terminal · Dashboard · Logs  │
└───────────────┬────────────────────────────────┘
                │ HTTP + WebSocket (localhost only)
┌───────────────▼────────────────────────────────┐
│ FastAPI backend (127.0.0.1)                     │
│  connection · files · shell · system · logs     │
└───────────────┬────────────────────────────────┘
                │ SSH / SFTP (Paramiko)
┌───────────────▼────────────────────────────────┐
│ Ubuntu VPS                                       │
└─────────────────────────────────────────────────┘
```

- The backend listens on `127.0.0.1` only — never exposed publicly.
- The SSH password is held in memory only, never written to disk.
- Electron uses `contextBridge` with `contextIsolation` enabled (no remote
  module, `nodeIntegration: false`).

---

## Project layout

```
vps-manager/
├── electron/                 Electron shell
│   ├── main.js               main process: backend spawn, ports, menu, About
│   ├── preload.js            contextBridge (backend URL from launch args)
│   ├── about.html            About window
│   ├── package.json          electron-builder config + scripts
│   └── build/                icon.icns + entitlements
├── frontend/                 React + Vite + Tailwind UI
│   └── src/
│       ├── api.js            backend URL resolution + REST/WS helpers
│       ├── monaco-setup.js   local (offline) Monaco loader + workers
│       ├── components/       ConnectionForm, Sidebar, FileTree, FileList,
│       │                     FileEditor, TerminalTab
│       ├── pages/            FileExplorer, Terminal, Dashboard, Logs
│       └── utils/files.js    formatting + language detection
├── backend/                  FastAPI + Paramiko
│   ├── main.py               app, CORS, /health, router registration
│   ├── ssh_client.py         Paramiko singleton (SSH + SFTP, locking)
│   ├── run_server.py         PyInstaller entry point
│   ├── requirements.txt
│   └── routes/               connection, files, shell, system, logs
├── local-dev/                dev + build scripts
│   ├── start.sh              launch backend + frontend + Electron (dynamic ports)
│   ├── build-backend.sh      freeze backend with PyInstaller
│   ├── make-icon.{py,sh}     generate placeholder icon.icns
│   └── test-connection.sh    automated connection-route checks
├── FEATURES.md               full feature list
├── PROGRESS.md               technical status + roadmap
└── README.md
```

---

## Quick start (development)

One command launches everything (backend, Vite, Electron). Ports are chosen
automatically if the defaults are busy.

```bash
./local-dev/start.sh
```

Variants:

```bash
./local-dev/start.sh --no-electron    # backend + Vite only (test in a browser)
./local-dev/start.sh --backend-only   # backend only
BACKEND_PORT=9000 ./local-dev/start.sh  # override the starting port
RELOAD=1 ./local-dev/start.sh          # enable backend auto-reload (dev)
VPS_DEVTOOLS=1 ./local-dev/start.sh    # open Electron DevTools on launch
```

First run creates the Python venv and installs all dependencies.

### Manual start (separate terminals)

```bash
# Backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# Frontend
cd frontend && npm install && npm run dev

# Electron
cd electron && npm install && npm run dev
```

---

## Production build (macOS, arm64)

```bash
cd electron && npm install
npm run dist
```

This runs, in order: icon generation → frontend build (offline Monaco) →
backend freeze (PyInstaller) → electron-builder packaging. Output:

```
dist-electron/
├── VPS Manager-<version>-arm64.dmg     installer
└── mac-arm64/VPS Manager.app           standalone app
```

Run it:

```bash
open "dist-electron/mac-arm64/VPS Manager.app"
```

Notes:
- **Unsigned by default.** electron-builder signs automatically only if a valid
  *Developer ID Application* certificate is present. Without one, the app runs
  locally but Gatekeeper quarantines it elsewhere
  (`xattr -dr com.apple.quarantine "<app>"`).
- **arm64 only.** PyInstaller cannot cross-compile; building an x64 variant
  requires running `build-backend.sh` on an Intel Mac (or under Rosetta).

---

## Backend API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health` | liveness probe |
| POST | `/connect` | open SSH+SFTP session `{host,port,username,password}` → `{status, host, username, home}` |
| POST | `/disconnect` | close the session |
| GET  | `/status` | `{connected, host, username, home}` |
| GET  | `/files/list?path=` | directory listing |
| GET  | `/files/read?path=` | read UTF-8 text (400 on binary) |
| POST | `/files/write` | create/overwrite a file |
| POST | `/files/rename` | rename in place |
| POST | `/files/move` | move/relocate |
| POST | `/files/delete` | delete (`recursive` for dirs) |
| POST | `/files/mkdir` | create a directory |
| POST | `/files/upload` | multipart upload (streamed) |
| GET  | `/files/download?path=` | streamed download |
| WS   | `/shell` | interactive PTY shell |
| GET  | `/system/metrics` | CPU, memory, disk, uptime, load |
| GET  | `/system/processes` | top 50 processes by CPU |
| POST | `/system/kill` | SIGTERM a PID (guards 0/1) |
| WS   | `/logs` | live `tail -F` of a file |
| GET  | `/logs/list` | readable common log files |

Errors return `{ "detail": "<message>" }` with appropriate status codes
(401 auth, 403 permission, 404 not found, 400 bad request, 409 not connected,
503 unreachable).

---

## Security

- SSH password kept only in the live Paramiko transport — never persisted.
- Backend bound to localhost; CORS allows local origins only.
- `system/kill` refuses PID ≤ 0 and PID 1.
- Log streaming never uses `sudo`; only files readable by the SSH user appear.

See **FEATURES.md** for the full feature list and **PROGRESS.md** for the
current status and roadmap.
