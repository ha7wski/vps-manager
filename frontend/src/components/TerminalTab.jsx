// A single interactive terminal: one xterm instance bound to one /shell
// WebSocket. Exposes clear()/focus() to the parent via a ref.

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RotateCw } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { BACKEND_WS_URL } from "../api";

const THEME = {
  background: "#0f172a",
  foreground: "#e2e8f0",
  cursor: "#e2e8f0",
  selectionBackground: "#334155",
};

// Heuristic: control frames are short compact JSON objects with a known type.
// Everything else is raw terminal output (which xterm renders, ANSI included).
function parseControl(raw) {
  if (raw.length > 256 || raw[0] !== "{") return null;
  try {
    const m = JSON.parse(raw);
    if (m && (m.type === "error" || m.type === "exit")) return m;
  } catch {
    // not a control frame
  }
  return null;
}

const TerminalTab = forwardRef(function TerminalTab({ active, fontSize }, ref) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [status, setStatus] = useState("connecting"); // connecting | open | closed
  const [statusMsg, setStatusMsg] = useState("");

  useImperativeHandle(ref, () => ({
    clear: () => termRef.current?.clear(),
    focus: () => termRef.current?.focus(),
    refit: () => safeFit(),
  }));

  function safeFit() {
    try {
      fitRef.current?.fit();
      const term = termRef.current;
      const ws = wsRef.current;
      if (term && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    } catch {
      // container not measurable yet
    }
  }

  function connect() {
    const term = termRef.current;
    setStatus("connecting");
    setStatusMsg("");

    const ws = new WebSocket(`${BACKEND_WS_URL}/shell`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      safeFit(); // sends initial resize with current cols/rows
      term.focus();
    };
    ws.onmessage = (e) => {
      const ctrl = parseControl(e.data);
      if (ctrl) {
        if (ctrl.type === "error") {
          term.write(`\r\n\x1b[31m[error] ${ctrl.message}\x1b[0m\r\n`);
        } else if (ctrl.type === "exit") {
          term.write(`\r\n\x1b[33m[${ctrl.message}]\x1b[0m\r\n`);
        }
        return;
      }
      term.write(e.data);
    };
    ws.onclose = () => {
      setStatus("closed");
      setStatusMsg("Connection closed");
    };
    ws.onerror = () => {
      setStatus("closed");
      setStatusMsg("WebSocket error");
    };
  }

  // Initialize xterm once.
  useEffect(() => {
    const term = new XTerm({
      fontFamily: "JetBrains Mono, Fira Code, Menlo, monospace",
      fontSize,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;
    safeFit();

    // Forward user keystrokes to the SSH channel.
    const dataSub = term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    connect();

    // Refit on container size changes.
    const ro = new ResizeObserver(() => safeFit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // avoid setStatus after unmount
        ws.close();
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply font-size changes and refit.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    safeFit();
  }, [fontSize]);

  // Refit/focus when this tab becomes active (it may have been hidden).
  useEffect(() => {
    if (active) {
      // Defer so layout has settled before measuring.
      const id = setTimeout(() => {
        safeFit();
        termRef.current?.focus();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [active]);

  function reconnect() {
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    termRef.current?.clear();
    connect();
  }

  return (
    <div className={`absolute inset-0 ${active ? "z-10 opacity-100" : "pointer-events-none -z-10 opacity-0"}`}>
      <div ref={containerRef} className="h-full w-full bg-[#0f172a] p-1" />

      {status === "closed" && active && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60">
          <p className="mb-3 text-sm text-gray-300">{statusMsg || "Disconnected"}</p>
          <button
            onClick={reconnect}
            className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <RotateCw className="h-4 w-4" /> Reconnect
          </button>
        </div>
      )}
    </div>
  );
});

export default TerminalTab;
