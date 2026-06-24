// Collapsible directory tree with lazy loading.
// Only directories are shown; children are fetched the first time a node is
// expanded and then cached.

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from "lucide-react";
import { filesApi } from "../api";
import { joinPath } from "../utils/files";

// Ancestor chain from rootPath down to target, e.g. ("/", "/home/user")
// -> ["/", "/home", "/home/user"]. Used to auto-expand the tree on open.
function ancestorChain(rootPath, target) {
  if (!target || !target.startsWith(rootPath)) return [rootPath];
  const rest = target.slice(rootPath === "/" ? 1 : rootPath.length);
  const chain = [rootPath];
  let cur = rootPath === "/" ? "" : rootPath;
  for (const part of rest.split("/").filter(Boolean)) {
    cur = `${cur}/${part}`;
    chain.push(cur);
  }
  return chain;
}

export default function FileTree({ rootPath = "/", selectedPath, onSelect, refreshKey }) {
  // Cache of directory -> array of child dir names. Map for stable updates.
  const [children, setChildren] = useState({}); // { [path]: string[] }
  // Initial path the tree should be expanded to (captured once, on mount).
  const initialTarget = useRef(selectedPath);
  const [expanded, setExpanded] = useState(() => new Set(ancestorChain(rootPath, initialTarget.current)));
  const [loading, setLoading] = useState(new Set());

  // Keep a ref to the currently expanded set for the refresh effect.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const loadChildren = useCallback(async (path) => {
    setLoading((s) => new Set(s).add(path));
    try {
      const res = await filesApi.list(path);
      const dirs = res.items.filter((i) => i.type === "dir").map((i) => i.name);
      setChildren((c) => ({ ...c, [path]: dirs }));
    } catch {
      setChildren((c) => ({ ...c, [path]: [] }));
    } finally {
      setLoading((s) => {
        const next = new Set(s);
        next.delete(path);
        return next;
      });
    }
  }, []);

  // On mount (or root change), load the whole chain from root down to the
  // initial directory so the tree opens already expanded to it.
  useEffect(() => {
    ancestorChain(rootPath, initialTarget.current).forEach((p) => loadChildren(p));
  }, [rootPath, loadChildren]);

  // On a refresh request (after a mutation), reload every expanded directory so
  // new/removed folders show up in the tree.
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    expandedRef.current.forEach((p) => loadChildren(p));
  }, [refreshKey, loadChildren]);

  function toggle(path) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!children[path]) loadChildren(path);
      }
      return next;
    });
  }

  function renderNode(path, name, depth) {
    const isExpanded = expanded.has(path);
    const isSelected = selectedPath === path;
    const isLoading = loading.has(path);
    const kids = children[path];

    return (
      <div key={path}>
        <div
          onClick={() => {
            onSelect(path);
            if (!isExpanded) toggle(path);
          }}
          className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm ${
            isSelected ? "bg-blue-900/40 text-blue-200" : "text-gray-300 hover:bg-gray-800"
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(path);
            }}
            className="flex h-4 w-4 items-center justify-center text-gray-500 hover:text-gray-300"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-400" />
          ) : (
            <Folder className="h-4 w-4 flex-shrink-0 text-amber-400" />
          )}
          <span className="truncate">{name}</span>
        </div>

        {isExpanded && kids && (
          <div>
            {kids.length === 0 ? null : kids.map((child) => renderNode(joinPath(path, child), child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-[300px] flex-shrink-0 overflow-auto border-r border-gray-800 bg-gray-950 p-2">
      {renderNode(rootPath, rootPath.split("/").pop() || rootPath, 0)}
    </div>
  );
}
