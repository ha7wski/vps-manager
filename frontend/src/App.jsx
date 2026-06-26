// Root application shell.
//
// Two states:
//   - disconnected → ConnectionForm
//   - connected    → Sidebar (240px) + active page
//
// The active page is selected via the sidebar nav. Files is the default view.
//
// The Terminal page is special: it owns live shell sessions (WebSockets + xterm
// scrollback) that must survive navigating to other pages. So it stays mounted
// at all times and is merely hidden with CSS when another page is active. The
// other pages are stateless data views and mount/unmount on demand.

import { useState } from "react";
import ConnectionForm from "./components/ConnectionForm";
import Sidebar from "./components/Sidebar";
import FileExplorer from "./pages/FileExplorer";
import Terminal from "./pages/Terminal";
import Dashboard from "./pages/Dashboard";
import Logs from "./pages/Logs";
import { apiFetch } from "./api";

const PAGES = {
  files: FileExplorer,
  dashboard: Dashboard,
  logs: Logs,
};

export default function App() {
  const [connection, setConnection] = useState(null); // null = disconnected
  const [page, setPage] = useState("files");

  async function handleDisconnect() {
    try {
      await apiFetch("/disconnect", { method: "POST" });
    } catch {
      // Ignore errors — we tear down the UI regardless.
    }
    setConnection(null);
    setPage("files");
  }

  if (!connection) {
    return <ConnectionForm onConnected={setConnection} />;
  }

  const isTerminal = page === "terminal";
  const ActivePage = PAGES[page] ?? FileExplorer;

  return (
    <div className="flex h-full bg-gray-950 text-gray-200">
      <Sidebar
        active={page}
        onNavigate={setPage}
        connection={connection}
        onDisconnect={handleDisconnect}
      />
      <main className="flex-1 overflow-hidden bg-gray-900 p-6">
        {/* Terminal stays mounted so its shell sessions and scrollback persist;
            it's hidden (not unmounted) when another page is active. */}
        <div className={isTerminal ? "h-full" : "hidden"}>
          <Terminal home={connection.home} active={isTerminal} />
        </div>
        {!isTerminal && <ActivePage home={connection.home} />}
      </main>
    </div>
  );
}
