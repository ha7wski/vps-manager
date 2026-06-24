// Directory contents panel: breadcrumb toolbar, sortable columns, context
// menu, inline rename, delete confirmation, and drag-and-drop upload.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Folder,
  FileText,
  FileCode,
  File as FileIcon,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Upload,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { filesApi, uploadFile } from "../api";
import { formatSize, formatDate, joinPath, detectLanguage } from "../utils/files";

const CODE_LANGS = new Set([
  "python",
  "javascript",
  "typescript",
  "json",
  "yaml",
  "shell",
  "ini",
  "html",
  "css",
  "scss",
  "xml",
  "sql",
  "go",
  "rust",
  "c",
  "cpp",
  "java",
  "php",
  "ruby",
  "dockerfile",
]);

function iconForItem(item) {
  if (item.type === "dir") return <Folder className="h-4 w-4 text-amber-400" />;
  const lang = detectLanguage(item.name);
  if (lang === "markdown" || lang === "plaintext" || lang === "log")
    return <FileText className="h-4 w-4 text-gray-400" />;
  if (CODE_LANGS.has(lang)) return <FileCode className="h-4 w-4 text-sky-400" />;
  return <FileIcon className="h-4 w-4 text-gray-500" />;
}

export default function FileList({ path, onNavigate, onOpenFile, refreshKey, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [selected, setSelected] = useState(null);

  const [menu, setMenu] = useState(null); // { x, y, item|null }
  const [renaming, setRenaming] = useState(null); // item name being renamed
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // item
  const [nameModal, setNameModal] = useState(null); // { type: 'file'|'folder' }
  const [nameValue, setNameValue] = useState("");
  const [uploads, setUploads] = useState([]); // [{ name, progress }]
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  const refresh = useCallback(() => setLocalRefresh((n) => n + 1), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await filesApi.list(path);
      setItems(res.items);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
    setSelected(null);
  }, [load, refreshKey, localRefresh]);

  // Close the context menu on any outside click.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  // --- sorting --------------------------------------------------------------

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const visible = items.filter((i) => showHidden || !i.is_hidden);
  const sorted = [...visible].sort((a, b) => {
    // Directories always first; sort applies within each group.
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    let cmp;
    if (sort.key === "size") cmp = (a.size || 0) - (b.size || 0);
    else if (sort.key === "modified") cmp = (a.modified || "").localeCompare(b.modified || "");
    else if (sort.key === "permissions") cmp = a.permissions.localeCompare(b.permissions);
    else cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return sort.dir === "asc" ? cmp : -cmp;
  });

  // --- actions --------------------------------------------------------------

  function openItem(item) {
    if (item.type === "dir") onNavigate(joinPath(path, item.name));
    else onOpenFile(joinPath(path, item.name), item.name);
  }

  function startRename(item) {
    setRenaming(item.name);
    setRenameValue(item.name);
    setMenu(null);
  }

  async function submitRename(item) {
    const newName = renameValue.trim();
    setRenaming(null);
    if (!newName || newName === item.name) return;
    try {
      await filesApi.rename(joinPath(path, item.name), newName);
      refresh();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function doDelete(item) {
    setConfirmDelete(null);
    try {
      await filesApi.remove(joinPath(path, item.name), item.type === "dir");
      refresh();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function downloadItem(item) {
    setMenu(null);
    const a = document.createElement("a");
    a.href = filesApi.downloadUrl(joinPath(path, item.name));
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function submitNewItem() {
    const name = nameValue.trim();
    const type = nameModal.type;
    setNameModal(null);
    setNameValue("");
    if (!name) return;
    try {
      const target = joinPath(path, name);
      if (type === "folder") await filesApi.mkdir(target);
      else await filesApi.write(target, "");
      refresh();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploads(files.map((f) => ({ name: f.name, progress: 0 })));
    for (const file of files) {
      try {
        await uploadFile(file, path, (p) =>
          setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: p } : x)))
        );
      } catch (err) {
        setError(`Upload of ${file.name} failed: ${err.message}`);
      }
    }
    setUploads([]);
    refresh();
    onChanged?.();
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  // --- render ---------------------------------------------------------------

  const segments = path.split("/").filter(Boolean);

  return (
    <div
      className="relative flex h-full flex-1 flex-col bg-gray-900"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
        {/* Breadcrumb */}
        <div className="flex flex-1 items-center gap-1 overflow-hidden text-sm text-gray-400">
          <button onClick={() => onNavigate("/")} className="hover:text-gray-200">
            /
          </button>
          {segments.map((seg, i) => {
            const segPath = "/" + segments.slice(0, i + 1).join("/");
            return (
              <span key={segPath} className="flex items-center gap-1">
                <button onClick={() => onNavigate(segPath)} className="hover:text-gray-200">
                  {seg}
                </button>
                {i < segments.length - 1 && <span className="text-gray-600">/</span>}
              </span>
            );
          })}
        </div>

        <ToolbarButton title="Refresh" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="New File" onClick={() => { setNameModal({ type: "file" }); setNameValue(""); }}>
          <FilePlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="New Folder" onClick={() => { setNameModal({ type: "folder" }); setNameValue(""); }}>
          <FolderPlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Upload" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title={showHidden ? "Hide hidden" : "Show hidden"} onClick={() => setShowHidden((s) => !s)}>
          {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_110px_140px_180px] border-b border-gray-800 px-3 py-1.5 text-xs font-medium text-gray-500">
        <SortHeader label="Name" col="name" sort={sort} onClick={toggleSort} />
        <SortHeader label="Size" col="size" sort={sort} onClick={toggleSort} />
        <SortHeader label="Permissions" col="permissions" sort={sort} onClick={toggleSort} />
        <SortHeader label="Modified" col="modified" sort={sort} onClick={toggleSort} />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, item: null }); }}>
        {loading && (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {error && !loading && (
          <div className="m-3 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div className="px-3 py-4 text-sm text-gray-600">Empty directory</div>
        )}
        {sorted.map((item) => {
          const isSel = selected === item.name;
          return (
            <div
              key={item.name}
              onClick={() => setSelected(item.name)}
              onDoubleClick={() => openItem(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelected(item.name);
                setMenu({ x: e.clientX, y: e.clientY, item });
              }}
              className={`grid cursor-default grid-cols-[1fr_110px_140px_180px] items-center px-3 py-1.5 text-sm ${
                isSel ? "border-l-2 border-blue-500 bg-blue-900/40" : "border-l-2 border-transparent hover:bg-gray-800"
              } ${item.is_hidden ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {iconForItem(item)}
                {renaming === item.name ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => submitRename(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(item);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="w-full rounded border border-blue-500 bg-gray-950 px-1 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <span className="truncate text-gray-200">{item.name}</span>
                )}
              </div>
              <div className="text-gray-400">{item.type === "dir" ? "—" : formatSize(item.size)}</div>
              <div className="font-mono text-xs text-gray-500">{item.permissions}</div>
              <div className="text-gray-500">{formatDate(item.modified)}</div>
            </div>
          );
        })}
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-emerald-500 bg-emerald-950/30">
          <span className="text-sm font-medium text-emerald-300">Drop files to upload to {path}</span>
        </div>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="absolute bottom-3 right-3 z-20 w-72 space-y-2 rounded-lg border border-gray-700 bg-gray-950 p-3 shadow-xl">
          <div className="text-xs font-medium text-gray-300">Uploading…</div>
          {uploads.map((u) => (
            <div key={u.name}>
              <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span className="truncate">{u.name}</span>
                <span>{Math.round(u.progress * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${u.progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Context menu */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          item={menu.item}
          onOpen={() => { openItem(menu.item); setMenu(null); }}
          onRename={() => startRename(menu.item)}
          onDelete={() => { setConfirmDelete(menu.item); setMenu(null); }}
          onDownload={() => downloadItem(menu.item)}
          onNewFile={() => { setNameModal({ type: "file" }); setNameValue(""); setMenu(null); }}
          onNewFolder={() => { setNameModal({ type: "folder" }); setNameValue(""); setMenu(null); }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h3 className="text-base font-semibold text-white">Delete {confirmDelete.type}</h3>
          <p className="mt-2 text-sm text-gray-400">
            Delete <span className="font-mono text-gray-200">{confirmDelete.name}</span>?
            {confirmDelete.type === "dir" && " This will recursively remove all contents."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
              Cancel
            </button>
            <button onClick={() => doDelete(confirmDelete)} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500">
              Delete
            </button>
          </div>
        </Modal>
      )}

      {/* New file/folder name */}
      {nameModal && (
        <Modal onClose={() => setNameModal(null)}>
          <h3 className="text-base font-semibold text-white">
            New {nameModal.type === "folder" ? "Folder" : "File"}
          </h3>
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewItem();
              if (e.key === "Escape") setNameModal(null);
            }}
            placeholder={nameModal.type === "folder" ? "folder-name" : "file.txt"}
            className="mt-3 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-500"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setNameModal(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
              Cancel
            </button>
            <button onClick={submitNewItem} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
              Create
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ToolbarButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
    >
      {children}
    </button>
  );
}

function SortHeader({ label, col, sort, onClick }) {
  const active = sort.key === col;
  return (
    <button onClick={() => onClick(col)} className="flex items-center gap-1 text-left hover:text-gray-300">
      {label}
      {active && (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  );
}

function ContextMenu({ x, y, item, onOpen, onRename, onDelete, onDownload, onNewFile, onNewFolder }) {
  const isFile = item && item.type !== "dir";
  return (
    <div
      className="fixed z-30 min-w-[160px] rounded-md border border-gray-700 bg-gray-900 py-1 text-sm shadow-xl"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      {item && (
        <>
          <MenuItem onClick={onOpen}>{item.type === "dir" ? "Expand" : "Open"}</MenuItem>
          <MenuItem onClick={onRename}>Rename</MenuItem>
          {isFile && <MenuItem onClick={onDownload}>Download</MenuItem>}
          <MenuItem onClick={onDelete} danger>
            Delete
          </MenuItem>
          <div className="my-1 border-t border-gray-800" />
        </>
      )}
      <MenuItem onClick={onNewFile}>New File</MenuItem>
      <MenuItem onClick={onNewFolder}>New Folder</MenuItem>
    </div>
  );
}

function MenuItem({ onClick, children, danger }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-gray-800 ${danger ? "text-red-400" : "text-gray-200"}`}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[360px] rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
