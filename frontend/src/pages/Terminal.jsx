// Terminal page: tab bar of independent SSH sessions + a toolbar (clear,
// font size). Each tab keeps its own WebSocket/xterm alive while hidden.

import { useState, useRef, useEffect } from "react";
import { Plus, X, Trash2, Minus } from "lucide-react";
import TerminalTab from "../components/TerminalTab";

let nextId = 1;

// `active` is false while another page is shown (this page stays mounted but
// CSS-hidden, so its sessions/scrollback persist). When it becomes visible
// again the active tab is re-measured and re-focused.
export default function Terminal({ active = true }) {
  const [tabs, setTabs] = useState(() => [{ id: nextId++ }]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const [fontSize, setFontSize] = useState(14);

  // Imperative handles keyed by tab id (clear/focus/refit).
  const handles = useRef({});

  // The page was hidden via display:none, which zeroes the xterm size. On
  // re-show, refit and refocus the active tab once layout has settled.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => {
      handles.current[activeId]?.refit();
      handles.current[activeId]?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [active, activeId]);

  function addTab() {
    const id = nextId++;
    setTabs((t) => [...t, { id }]);
    setActiveId(id);
  }

  function closeTab(id) {
    // A live session may have a running process — confirm first.
    if (!window.confirm("Close this terminal? Any running process will be terminated.")) return;
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (id === activeId && remaining.length) {
        setActiveId(remaining[remaining.length - 1].id);
      }
      return remaining;
    });
    delete handles.current[id];
  }

  const clearActive = () => handles.current[activeId]?.clear();
  const incFont = () => setFontSize((s) => Math.min(28, s + 1));
  const decFont = () => setFontSize((s) => Math.max(9, s - 1));

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] flex-col">
      {/* Tab bar + toolbar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 pr-2">
        <div className="flex items-end">
          {tabs.map((tab, i) => {
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={`flex cursor-pointer items-center gap-2 border-t-2 px-4 py-2 text-sm ${
                  isActive
                    ? "border-blue-500 bg-gray-800 text-gray-100"
                    : "border-transparent text-gray-400 hover:bg-gray-800/50"
                }`}
              >
                <span>Terminal {i + 1}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-gray-200"
                    title="Close tab"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={addTab}
            className="px-3 py-2 text-gray-400 hover:text-gray-200"
            title="New terminal"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-1">
          <button onClick={decFont} className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200" title="Decrease font size">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-7 text-center text-xs text-gray-500">{fontSize}</span>
          <button onClick={incFont} className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200" title="Increase font size">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={clearActive} className="ml-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200" title="Clear terminal">
            <Trash2 className="h-4 w-4" /> Clear
          </button>
        </div>
      </div>

      {/* Terminal surfaces (all mounted; only the active one is visible) */}
      <div className="relative flex-1 bg-[#0f172a]">
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            ref={(h) => {
              if (h) handles.current[tab.id] = h;
              else delete handles.current[tab.id];
            }}
            active={tab.id === activeId}
            fontSize={fontSize}
          />
        ))}
      </div>
    </div>
  );
}
