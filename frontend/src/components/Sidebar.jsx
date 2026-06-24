// Fixed 240px navigation sidebar shown in the connected layout.

import { Folder, Terminal, LayoutDashboard, FileText, LogOut, Server } from "lucide-react";

const NAV_ITEMS = [
  { id: "files", label: "Files", icon: Folder },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "logs", label: "Logs", icon: FileText },
];

export default function Sidebar({ active, onNavigate, connection, onDisconnect }) {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-800 bg-slate-900">
      {/* Draggable top strip so the macOS traffic-light buttons (hiddenInset
          title bar) don't overlap the title. */}
      <div className="h-7 flex-shrink-0" style={{ WebkitAppRegion: "drag" }} />
      {/* Title */}
      <div className="flex items-center gap-2 px-4 pb-4" style={{ WebkitAppRegion: "drag" }}>
        <Server className="h-5 w-5 text-emerald-400" />
        <span className="text-base font-semibold text-white">VPS Manager</span>
      </div>

      {/* Connection indicator */}
      <div className="mx-4 mb-4 flex items-center gap-2 rounded-md bg-gray-800/60 px-3 py-2">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-gray-200">
            {connection?.username}@{connection?.host}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-emerald-400">Connected</div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Disconnect */}
      <div className="border-t border-gray-800 p-2">
        <button
          onClick={onDisconnect}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
