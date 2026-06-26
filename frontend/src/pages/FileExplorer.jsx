// File explorer page: FileTree (300px) + FileList, with the Monaco editor
// overlaying the panels when a file is opened.

import { useState } from "react";
import FileTree from "../components/FileTree";
import FileList from "../components/FileList";
import FileEditor from "../components/FileEditor";

// The tree is rooted at "/" so the whole filesystem is browsable; the explorer
// opens on /opt (where the user's applications live) and auto-expands the tree
// down to it.
const TREE_ROOT = "/";
const START_PATH = "/opt";

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState(START_PATH);
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
      {/* Right panel: the file list, with the editor overlaying only this area
          (not the tree) so the folder tree stays visible while editing. */}
      <div className="relative flex-1 overflow-hidden">
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
    </div>
  );
}
