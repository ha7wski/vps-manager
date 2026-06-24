// File explorer page: FileTree (300px) + FileList, with the Monaco editor
// overlaying the panels when a file is opened.

import { useState } from "react";
import FileTree from "../components/FileTree";
import FileList from "../components/FileList";
import FileEditor from "../components/FileEditor";

// The tree is rooted at "/" so the whole filesystem is browsable; the explorer
// opens on the SSH user's home directory (resolved at connect time) and
// auto-expands the tree down to it, falling back to "/" if unknown.
const TREE_ROOT = "/";

export default function FileExplorer({ home }) {
  const [currentPath, setCurrentPath] = useState(home || "/");
  const [editing, setEditing] = useState(null); // { path, name }
  // Bumped after mutations so the tree re-fetches its cached children.
  const [refreshKey, setRefreshKey] = useState(0);

  const bumpRefresh = () => setRefreshKey((n) => n + 1);

  return (
    <div className="relative -m-6 flex h-[calc(100%+3rem)]">
      <FileTree
        rootPath={TREE_ROOT}
        selectedPath={currentPath}
        onSelect={setCurrentPath}
        refreshKey={refreshKey}
      />
      <FileList
        path={currentPath}
        onNavigate={setCurrentPath}
        onOpenFile={(path, name) => setEditing({ path, name })}
        refreshKey={refreshKey}
        onChanged={bumpRefresh}
      />

      {editing && (
        <FileEditor path={editing.path} name={editing.name} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
