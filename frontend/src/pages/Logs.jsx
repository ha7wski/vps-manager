// Real-time log viewer: select/enter a remote file, stream it via WS /logs
// (tail -F), color-code by level, filter-highlight, pause, and clear.

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { Play, Pause, Trash2, Plug, PlugZap } from "lucide-react";
import { logsApi, BACKEND_WS_URL } from "../api";

const MAX_LINES = 2000;
const INITIAL_LINES = 200;

// Classify a log line by level keyword.
function lineLevel(line) {
  const u = line.toUpperCase();
  if (/\b(ERROR|FATAL|CRIT|CRITICAL|ERR|EMERG|ALERT)\b/.test(u)) return "error";
  if (/\b(WARN|WARNING)\b/.test(u)) return "warn";
  if (/\bDEBUG\b/.test(u)) return "debug";
  if (/\bINFO\b/.test(u)) return "info";
  return "default";
}

const LEVEL_CLASS = {
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-gray-300",
  debug: "text-gray-500",
  default: "text-gray-300",
};

// Distinguish short control frames from raw log text.
function parseControl(raw) {
  if (raw.length > 256 || raw[0] !== "{") return null;
  try {
    const m = JSON.parse(raw);
    if (m && (m.type === "status" || m.type === "error") && Object.keys(m).length <= 3) return m;
  } catch {
    /* not control */
  }
  return null;
}

const STATUS_META = {
  connecting: { label: "Connecting", dot: "bg-amber-400" },
  live: { label: "Live", dot: "bg-emerald-500" },
  paused: { label: "Paused", dot: "bg-amber-400" },
  disconnected: { label: "Disconnected", dot: "bg-gray-500" },
};

export default function Logs() {
  const [logFiles, setLogFiles] = useState([]);
  const [selected, setSelected] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const intentionalClose = useRef(false);
  const reconnectTimer = useRef(null);
  const partial = useRef(""); // incomplete trailing line between chunks
  const pausedBuffer = useRef([]); // lines received while paused
  const pathRef = useRef("");

  const scrollRef = useRef(null);
  const atBottom = useRef(true);

  // Load the available log files once.
  useEffect(() => {
    logsApi
      .list()
      .then((res) => setLogFiles(res.logs))
      .catch((err) => setError(err.message));
  }, []);

  const appendLines = useCallback((newLines) => {
    if (newLines.length === 0) return;
    setLines((prev) => {
      const next = prev.concat(newLines);
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const handleText = useCallback(
    (text) => {
      const buffered = partial.current + text;
      const parts = buffered.split("\n");
      partial.current = parts.pop(); // last part may be incomplete
      if (parts.length === 0) return;
      if (paused) pausedBuffer.current.push(...parts);
      else appendLines(parts);
    },
    [paused, appendLines]
  );

  const connect = useCallback(
    (path) => {
      if (!path) return;
      pathRef.current = path;
      intentionalClose.current = false;
      setError(null);
      setStatus("connecting");

      const ws = new WebSocket(`${BACKEND_WS_URL}/logs`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ path, lines: INITIAL_LINES }));
      };
      ws.onmessage = (e) => {
        const ctrl = parseControl(e.data);
        if (ctrl) {
          if (ctrl.type === "error") {
            setError(ctrl.message);
            setStatus("disconnected");
            intentionalClose.current = true; // don't auto-reconnect on hard error
            ws.close();
          } else if (ctrl.type === "status") {
            if (ctrl.status === "live") setStatus((s) => (s === "paused" ? s : "live"));
            else if (ctrl.status === "ended") setStatus("disconnected");
          }
          return;
        }
        handleText(e.data);
      };
      ws.onclose = () => {
        if (intentionalClose.current) {
          setStatus("disconnected");
          return;
        }
        // Unexpected drop → auto-reconnect after a short delay.
        setStatus("connecting");
        reconnectTimer.current = setTimeout(() => connect(pathRef.current), 2000);
      };
      ws.onerror = () => {
        // onclose will follow and handle reconnect.
      };
    },
    [handleText]
  );

  function disconnect() {
    intentionalClose.current = true;
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    setStatus("disconnected");
  }

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      intentionalClose.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  function handleConnect() {
    const path = manualPath.trim() || selected;
    if (!path) {
      setError("Select or enter a log file path");
      return;
    }
    setLines([]);
    partial.current = "";
    pausedBuffer.current = [];
    connect(path);
  }

  function togglePause() {
    setPaused((p) => {
      const next = !p;
      if (!next) {
        // Resuming: flush buffered lines.
        appendLines(pausedBuffer.current);
        pausedBuffer.current = [];
        setStatus(wsRef.current?.readyState === WebSocket.OPEN ? "live" : status);
      } else {
        setStatus("paused");
      }
      return next;
    });
  }

  // Track whether the user is at the bottom of the scroll area.
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  // Auto-scroll to bottom on new lines, unless the user scrolled up.
  useLayoutEffect(() => {
    if (atBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const connected = status === "live" || status === "paused" || status === "connecting";
  const meta = STATUS_META[status];

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] flex-col bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setManualPath("");
          }}
          className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-emerald-500"
        >
          <option value="">Select a log file…</option>
          {logFiles.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <input
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          placeholder="/var/log/custom.log"
          className="flex-1 rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 font-mono text-sm text-gray-200 outline-none focus:border-emerald-500"
        />

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 px-2 text-xs text-gray-400">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </div>

        {connected ? (
          <button
            onClick={disconnect}
            className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            <Plug className="h-4 w-4" /> Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <PlugZap className="h-4 w-4" /> Connect
          </button>
        )}
      </div>

      {error && (
        <div className="border-b border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Log output */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto bg-[#0b1120] px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-gray-600">No output. Connect to a log file to start streaming.</div>
        ) : (
          lines.map((line, i) => {
            const level = lineLevel(line);
            const matches = search && line.toLowerCase().includes(search.toLowerCase());
            return (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${LEVEL_CLASS[level]} ${
                  matches ? "bg-yellow-500/20" : ""
                }`}
              >
                {line || " "}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center gap-2 border-t border-gray-800 px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter / highlight…"
          className="flex-1 rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-emerald-500"
        />
        <button
          onClick={togglePause}
          disabled={!connected}
          className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={() => {
            setLines([]);
            partial.current = "";
          }}
          className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          <Trash2 className="h-4 w-4" /> Clear
        </button>
        <span className="px-1 text-xs text-gray-600">{lines.length} lines</span>
      </div>
    </div>
  );
}
