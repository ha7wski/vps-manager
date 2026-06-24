// Preload script — bridges the renderer and main process safely.
// Uses contextBridge (no remote module, no nodeIntegration).

const { contextBridge } = require("electron");

// The main process passes the resolved backend port via additionalArguments
// (e.g. "--vps-backend-port=8001"). Fall back to 8000 if absent.
function resolveBackendPort() {
  const arg = process.argv.find((a) => a.startsWith("--vps-backend-port="));
  const port = arg ? parseInt(arg.split("=")[1], 10) : NaN;
  return Number.isInteger(port) ? port : 8000;
}

const port = resolveBackendPort();

contextBridge.exposeInMainWorld("vpsManager", {
  // Base URLs of the local FastAPI backend. The frontend uses these for all
  // REST and WebSocket calls.
  backendUrl: `http://127.0.0.1:${port}`,
  backendWsUrl: `ws://127.0.0.1:${port}`,
  platform: process.platform,
});
