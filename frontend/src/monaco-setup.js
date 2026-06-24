// Configure @monaco-editor/react to use the locally bundled monaco-editor
// instead of loading it from a CDN, so the app works fully offline.
//
// Vite bundles each language worker via the `?worker` suffix; we wire them up
// through MonacoEnvironment. Importing this module once (before <App/>) is
// enough — @monaco-editor/react's <Editor> then uses the local instance.

import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

// Point the React wrapper at the bundled monaco rather than the CDN loader.
loader.config({ monaco });
