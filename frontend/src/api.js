// Backend base URLs.
//
// In Electron, preload.js exposes window.vpsManager with the localhost URLs.
// In a plain browser dev session those globals are absent, so fall back to the
// default FastAPI address.

const fromPreload = typeof window !== "undefined" ? window.vpsManager : undefined;

// Resolution order:
//   1. Electron preload (knows the real port) — used inside the packaged/dev app.
//   2. VITE_BACKEND_PORT — set by start.sh for browser-only dev (--no-electron).
//   3. Default 8000.
const vitePort = import.meta.env.VITE_BACKEND_PORT;
const fallbackPort = vitePort ? Number(vitePort) : 8000;

export const BACKEND_URL = fromPreload?.backendUrl ?? `http://127.0.0.1:${fallbackPort}`;
export const BACKEND_WS_URL = fromPreload?.backendWsUrl ?? `ws://127.0.0.1:${fallbackPort}`;

// Small fetch helper that throws an Error carrying the backend's detail message.
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (rare); leave data null.
  }

  if (!res.ok) {
    const message = data?.detail || `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data;
}

// --- file operations -------------------------------------------------------

export const filesApi = {
  list: (path) => apiFetch(`/files/list?path=${encodeURIComponent(path)}`),
  read: (path) => apiFetch(`/files/read?path=${encodeURIComponent(path)}`),
  write: (path, content) =>
    apiFetch("/files/write", { method: "POST", body: JSON.stringify({ path, content }) }),
  rename: (path, new_name) =>
    apiFetch("/files/rename", { method: "POST", body: JSON.stringify({ path, new_name }) }),
  move: (source, destination) =>
    apiFetch("/files/move", { method: "POST", body: JSON.stringify({ source, destination }) }),
  remove: (path, recursive) =>
    apiFetch("/files/delete", { method: "POST", body: JSON.stringify({ path, recursive }) }),
  mkdir: (path) =>
    apiFetch("/files/mkdir", { method: "POST", body: JSON.stringify({ path }) }),
  downloadUrl: (path) => `${BACKEND_URL}/files/download?path=${encodeURIComponent(path)}`,
};

// --- system metrics --------------------------------------------------------

export const systemApi = {
  metrics: () => apiFetch("/system/metrics"),
  processes: () => apiFetch("/system/processes"),
  kill: (pid) => apiFetch("/system/kill", { method: "POST", body: JSON.stringify({ pid }) }),
};

// --- logs ------------------------------------------------------------------

export const logsApi = {
  list: () => apiFetch("/logs/list"),
};

// Upload a File object via multipart, reporting progress (0..1) through
// onProgress. Uses XHR because fetch cannot report upload progress.
export function uploadFile(file, destinationDir, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("destination_dir", destinationDir);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BACKEND_URL}/files/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.detail || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(form);
  });
}
