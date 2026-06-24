// Monaco-based text editor overlay. Opens when a file is double-clicked.
// Loads content via /files/read, saves via /files/write (Cmd/Ctrl+S), tracks
// unsaved changes, and warns before closing if dirty.

import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { X, Save, Loader2, Circle } from "lucide-react";
import { filesApi } from "../api";
import { detectLanguage } from "../utils/files";

export default function FileEditor({ path, name, onClose }) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const dirty = content !== original;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Latest content, so the save callback (deps: [path]) never reads stale state.
  const contentRef = useRef(content);
  contentRef.current = content;

  // Load file content.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    filesApi
      .read(path)
      .then((res) => {
        if (!active) return;
        setContent(res.content);
        setOriginal(res.content);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [path]);

  const save = useCallback(async () => {
    if (dirtyRef.current === false) return;
    setSaving(true);
    setError(null);
    try {
      const latest = contentRef.current;
      await filesApi.write(path, latest);
      setOriginal(latest);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [path]);

  function requestClose() {
    if (dirtyRef.current && !window.confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  }

  // Cmd/Ctrl+S to save (window-level so it works regardless of focus).
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const language = detectLanguage(name);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-800 px-3 py-2">
        <div className="flex flex-1 items-center gap-2 overflow-hidden text-sm">
          {dirty && <Circle className="h-2.5 w-2.5 flex-shrink-0 fill-amber-400 text-amber-400" />}
          <span className="truncate font-mono text-gray-300">{path}</span>
          {dirty && <span className="text-xs text-amber-400">• unsaved</span>}
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          onClick={requestClose}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="border-b border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Editor */}
      <div className="flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Editor
            height="100%"
            theme="vs-dark"
            language={language}
            value={content}
            onChange={(value) => setContent(value ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
