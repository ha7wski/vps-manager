// Root application shell.
//
// Two states:
//   - disconnected → ConnectionForm
//   - connected    → Sidebar (240px) + active page
//
// The active page is selected via the sidebar nav. Files is the default view.

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
  terminal: Terminal,
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
        <ActivePage home={connection.home} />
      </main>
    </div>
  );
}
