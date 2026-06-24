# Features

Complete list of functionality implemented in VPS Manager.

---

## 1. SSH connection

- Connection form with pre-filled host / port / username and a password field.
- Show/hide password toggle.
- Password authentication via Paramiko (SSH + SFTP in one session).
- Loading state on the button ("Connecting…").
- Clear error reporting from the backend: wrong password → 401, host
  unreachable / timeout → 503, validation errors → 422.
- Connection status indicator in the sidebar (green dot + `user@host`).
- Password is held in memory only, never written to disk.
- `/status` endpoint reports current connection state.

## 2. File explorer

- Two-panel layout: collapsible directory tree (left) + directory contents
  (right).
- **Tree rooted at `/`** — the whole filesystem is browsable; auto-expands down
  to `/home/<user>` on open.
- Lazy loading: a directory's children are fetched only when expanded, then
  cached. Tree refreshes all expanded dirs after a mutation.
- Listing columns: icon + name, size, permissions (`ls -l` style), modified
  date. Sortable by any column (directories always first).
- Clickable breadcrumb path.
- Toggle to show/hide dotfiles.
- File-type icons (folder, code, text, generic) via lucide-react.
- Right-click context menu: Open/Expand, Rename, Delete, Download (files),
  New File, New Folder.
- Inline rename.
- Delete with confirmation modal (recursive for directories).
- Create new file / new folder via modal.

## 3. File transfer

- **Upload**: drag & drop from Finder onto the file list, or via the toolbar
  Upload button. Streamed over SFTP in chunks with per-file progress bars and a
  multi-file queue.
- **Download**: right-click → Download, streamed back as an attachment.
- Uploads and downloads use dedicated SFTP channels so large transfers don't
  block other file operations.

## 4. File editor

- Monaco editor (`@monaco-editor/react`), **bundled locally** — works fully
  offline, no CDN.
- Opens on double-click of a file.
- Automatic syntax highlighting from the extension (py, js, ts, json, yaml,
  sh, conf/ini, md, html, css, sql, dockerfile, …).
- Save with Cmd/Ctrl+S → writes over SFTP.
- Unsaved-changes indicator (amber dot) and confirmation before closing dirty.
- Binary files are rejected with a clear message.

## 5. Interactive terminal

- Full xterm.js terminal over a `/shell` WebSocket (Paramiko `invoke_shell`
  PTY).
- ANSI colors, cursor blink, 5000-line scrollback, JetBrains Mono font.
- Auto-resize (FitAddon + ResizeObserver) — sends `resize` to the PTY.
- **Multiple tabs**, each an independent SSH session; tabs stay alive while
  hidden. Close with confirmation.
- Toolbar: new tab, font size +/-, clear.
- Reconnect button if the WebSocket drops.

## 6. System dashboard

- Metric cards (2-column grid):
  - **CPU**: usage % (computed from two `/proc/stat` samples) + recharts
    sparkline of the last 20 readings + core count.
  - **Memory**: used/total with a progress bar (uses `MemAvailable`).
  - **Disk**: one progress bar per real partition (tmpfs/devtmpfs/overlay/
    squashfs/loop excluded).
  - **Uptime & load**: human uptime + 1/5/15-minute load averages.
- Progress bars color-coded by usage tier (green < 60% < amber < 85% < red).
- Pause/Resume toggle for polling.
- Metrics auto-refresh every 5s; processes every 10s.
- Process table: PID, name, user, CPU%, MEM%, status — sortable, name filter.
- Kill button per row with a confirmation modal (SIGTERM; refuses PID 0/1).

## 7. Log viewer

- File picker (dropdown of detected common logs via `/logs/list`) plus a manual
  path input.
- Live streaming via `/logs` WebSocket (`tail -n … -F`, follows rotation).
- Level color-coding: ERROR/FATAL/CRIT → red, WARN → amber, INFO → gray,
  DEBUG → dim.
- Search box highlights matching lines.
- Pause/Resume (buffers while paused, flushes on resume) and Clear.
- Auto-scroll to bottom, paused automatically when the user scrolls up.
- 2000-line DOM cap (drops oldest).
- Status indicator (connecting / live / paused / disconnected) and automatic
  reconnect on unexpected drops.

---

## Platform / packaging features

- **Electron shell**: 1280×800 window, minimal macOS frame (`hiddenInset`),
  dark theme, draggable title strip so the traffic-light buttons don't overlap.
- **App menu + About window** (custom window + native about panel), Edit menu
  for Cmd+C/V.
- **Dynamic ports**: backend (8000) and frontend (5173) auto-shift to the next
  free port if busy; the chosen port is propagated to Electron → preload →
  frontend. Works in dev and in the packaged app.
- **Self-contained backend**: frozen with PyInstaller — the packaged app needs
  no system Python.
- **Offline-first**: Monaco and all assets bundled; no network dependency
  beyond the SSH connection itself.
- **Single build command**: `npm run dist` produces the `.dmg`.

## Developer tooling

- `local-dev/start.sh` — one-command dev launcher (dynamic ports, no killing of
  other projects' processes, optional auto-reload).
- `local-dev/build-backend.sh` — PyInstaller freeze.
- `local-dev/make-icon.{py,sh}` — placeholder icon generation (pure stdlib PNG
  → `iconutil`).
- `local-dev/test-connection.sh` — automated checks of the connection routes.
