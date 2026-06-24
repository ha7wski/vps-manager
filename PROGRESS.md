# Project progress

_Last updated: 2026-06-24_

Technical status of VPS Manager and what remains.

---

## Overall status

All 7 functional modules are **implemented**, the app **connects to the live
VPS**, and a production macOS build (`.dmg`, arm64) has been produced
successfully. The project is in the **end-to-end testing / hardening** phase.

---

## Module status

| # | Module | Built | Verified live | Notes |
|---|--------|:----:|:----:|-------|
| 1 | SSH connection | ✅ | ✅ | password auth; tested incl. wrong-password 401 |
| 2 | File explorer (tree + list) | ✅ | ✅ | navigation across the filesystem confirmed |
| 3 | Upload / download | ✅ | ⚠️ | code paths exercised; not fully drag-tested live |
| 4 | File editor (Monaco) | ✅ | ⚠️ | read confirmed live; save not yet exercised |
| 5 | Interactive terminal | ✅ | ✅ | live WS session connects (open/close confirmed against the VPS) |
| 6 | System dashboard | ✅ | ✅ | metrics + processes returning 200 live |
| 7 | Log viewer | ✅ | ⚠️ | WS + list built; live tail pending |

Legend: ✅ done · ⚠️ implemented but not yet confirmed against the live VPS.

---

## Infrastructure status

- **Backend** (FastAPI + Paramiko): all routers registered; runs both as a dev
  process and as a frozen PyInstaller executable (smoke-tested, `/health` 200).
- **Frontend** (React + Vite + Tailwind): builds cleanly; Monaco bundled
  offline (workers + language modes).
- **Electron**: dev + packaged paths working; About window + menu; dynamic
  backend-port resolution wired through preload.
- **Production build**: `npm run dist` → arm64 `.dmg` (~113 MB) generated.
- **Dev launcher**: `start.sh` with dynamic ports (non-destructive) and an
  optional `RELOAD` flag.

---

## Resolved issues (this iteration)

- **Concurrent SFTP corruption** — the shared Paramiko SFTP channel was not
  thread-safe; concurrent `/files/list` calls hung. Fixed with a lock
  (`sftp_session()`) for quick ops and dedicated channels for upload/download.
- **Port collisions** — `start.sh` and Electron both spawned a backend (port
  8000 clash). Fixed with `VPS_SKIP_BACKEND` + dynamic free-port search; other
  projects' processes are no longer killed.
- **iCloud reload loop** — project living under iCloud-synced `~/Desktop` caused
  `--reload` to restart constantly and drop the SSH session. Auto-reload is now
  off by default, and the project was **relocated to `~/Projects/vps-manager`**
  (outside iCloud). Note: `.git` history was not carried over (the repo had no
  commits); a fresh `git init` was done at the new location.
- **UI/UX** — file tree rooted at `/` (was stuck at `/home/<user>`); macOS
  traffic-light buttons no longer overlap the title; DevTools no longer open
  automatically.
- **Dynamic `$HOME` resolution** — the explorer no longer hardcodes a landing
  path. The backend resolves the SSH user's home at connect time
  (`sftp.normalize(".")`), returns it from `/connect` + `/status`, and the
  explorer opens there (falling back to `/`). Confirmed live: opens on
  `/home/kzool`.
- **`start.sh` lifecycle** — the launcher's final `wait` blocked on every
  background job, so closing the app left the backend and Vite running. The
  script now waits on the Electron PID only; closing the window triggers the
  `EXIT` trap that tears down the backend and Vite.

---

## Known limitations

- **Auth**: password only. Key-based auth (the user's actual setup) is **not**
  implemented yet.
- **Code signing / notarization**: not configured; build is unsigned.
- **Architecture**: arm64 only (PyInstaller can't cross-compile to x64).
- **Terminal copy/paste**: relies on OS clipboard; no explicit handlers.
- **Control-frame heuristic**: terminal/logs distinguish JSON control frames
  from raw output by a length+shape heuristic — a rare false positive is
  possible.
- **Privileged logs**: root-only logs (`/var/log/syslog`, `auth.log`, …) are
  not readable unless the SSH user is in the `adm`/`syslog` group (no `sudo`).
- **Monaco bundle size**: ~4 MB JS (all languages bundled for offline use).

---

## Roadmap / next steps

1. **Live end-to-end test pass** of the remaining unverified modules
   (upload/download, editor save, log tail). Terminal now confirmed live.
2. **SSH key authentication** (key path + passphrase) — recommended given the
   user's key-based setup.
3. ~~Relocate the project out of iCloud and confirm clean startup.~~ **Done** —
   now at `~/Projects/vps-manager`.
4. Optional: signing + notarization for distribution.
5. Optional: terminal copy/paste polish; framed WS protocol to remove the
   control-frame heuristic.
