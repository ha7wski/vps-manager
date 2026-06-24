// Electron main process.
// Responsibilities:
//   1. Start the backend — bundled PyInstaller executable in production, or
//      `python3 -m uvicorn` in dev.
//   2. Create the main BrowserWindow and load the React frontend (Vite dev
//      server in dev, packaged static files in production).
//   3. Provide an application menu with an About window.
//   4. Kill the backend cleanly when the app quits.

const { app, BrowserWindow, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");

const BACKEND_HOST = "127.0.0.1";

const DEV_URL = process.env.ELECTRON_START_URL || "http://localhost:5173";
const isDev = !app.isPackaged;

let mainWindow = null;
let aboutWindow = null;
let backendProcess = null;
// Resolved at startup; the renderer is told which port to use via preload.
let backendPort = 8000;

// Is a TCP port free to bind on the loopback interface?
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, BACKEND_HOST);
  });
}

// Find the first free port at or above `start` (so we don't collide with other
// projects already using 8000).
async function findFreePort(start) {
  for (let p = start; p < start + 100; p += 1) {
    if (await isPortFree(p)) return p;
  }
  return start;
}

async function resolveBackendPort() {
  // Dev via start.sh: the backend is already up on this port.
  if (process.env.VPS_BACKEND_PORT) {
    return parseInt(process.env.VPS_BACKEND_PORT, 10);
  }
  // We start the backend ourselves: pick a free port.
  return findFreePort(8000);
}

function startBackend(port) {
  // When launched by local-dev/start.sh, the backend is already running — skip
  // spawning a second one (which would collide on the port).
  if (process.env.VPS_SKIP_BACKEND === "1") {
    console.log(`VPS_SKIP_BACKEND=1 — using externally managed backend on port ${port}`);
    return;
  }

  if (isDev) {
    // Dev: run uvicorn from the backend source dir using the system Python.
    const backendDir = path.join(__dirname, "..", "backend");
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    backendProcess = spawn(
      pythonCmd,
      ["-m", "uvicorn", "main:app", "--host", BACKEND_HOST, "--port", String(port)],
      { cwd: backendDir, stdio: "inherit" }
    );
  } else {
    // Production: run the frozen backend copied into Contents/Resources/backend.
    const exe = path.join(process.resourcesPath, "backend", "vps-manager-backend");
    backendProcess = spawn(exe, [], {
      stdio: "inherit",
      env: { ...process.env, VPS_BACKEND_HOST: BACKEND_HOST, VPS_BACKEND_PORT: String(port) },
    });
  }

  backendProcess.on("error", (err) => {
    console.error("Failed to start backend:", err);
  });
}

function waitForBackend(port, retries = 60) {
  // Poll /health until the backend is ready.
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(
        { host: BACKEND_HOST, port, path: "/health", timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry(left);
        }
      );
      req.on("error", () => retry(left));
      req.on("timeout", () => {
        req.destroy();
        retry(left);
      });
    };
    const retry = (left) => {
      if (left <= 0) return reject(new Error("Backend did not start in time"));
      setTimeout(() => attempt(left - 1), 500);
    };
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "VPS Manager",
    backgroundColor: "#0f172a",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Pass the resolved backend port to the preload script.
      additionalArguments: [`--vps-backend-port=${backendPort}`],
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    // DevTools no longer open automatically. Set VPS_DEVTOOLS=1 to open them,
    // or use the menu / Cmd+Alt+I while the app is running.
    if (process.env.VPS_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    // Packaged renderer lives in Contents/Resources/frontend (extraResources).
    mainWindow.loadFile(path.join(process.resourcesPath, "frontend", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openAbout() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }
  aboutWindow = new BrowserWindow({
    width: 360,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "About VPS Manager",
    backgroundColor: "#0f172a",
    parent: mainWindow || undefined,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  aboutWindow.loadFile(path.join(__dirname, "about.html"), {
    search: `v=${app.getVersion()}`,
  });
  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });
}

function buildMenu() {
  // Native About panel as a fallback / for the standard "About" affordance.
  app.setAboutPanelOptions({
    applicationName: "VPS Manager",
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: "VPS Manager",
  });

  const template = [
    {
      label: "VPS Manager",
      submenu: [
        { label: "About VPS Manager", click: openAbout },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    // Edit menu gives Cmd+C / Cmd+V (useful for the terminal and editor).
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  buildMenu();
  backendPort = await resolveBackendPort();
  startBackend(backendPort);
  try {
    await waitForBackend(backendPort);
  } catch (err) {
    console.error(err);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }
}

app.on("window-all-closed", () => {
  stopBackend();
  app.quit();
});

app.on("before-quit", stopBackend);
app.on("will-quit", stopBackend);
