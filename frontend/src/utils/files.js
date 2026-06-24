// File helpers shared across the explorer components.

// Return the parent directory of a POSIX path ("/a/b" -> "/a", "/a" -> "/").
export function posixDirname(path) {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export function formatSize(bytes) {
  if (bytes === 0 || bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Join a directory and a name into a POSIX path.
export function joinPath(dir, name) {
  if (dir === "/") return `/${name}`;
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

// Map a filename extension to a Monaco language id.
const EXT_LANGUAGE = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  conf: "ini",
  ini: "ini",
  cfg: "ini",
  toml: "ini",
  md: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  xml: "xml",
  sql: "sql",
  go: "go",
  rs: "rust",
  c: "c",
  h: "c",
  cpp: "cpp",
  java: "java",
  php: "php",
  rb: "ruby",
  dockerfile: "dockerfile",
  log: "log",
  txt: "plaintext",
};

export function detectLanguage(filename) {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  const ext = lower.includes(".") ? lower.split(".").pop() : "";
  return EXT_LANGUAGE[ext] || "plaintext";
}
