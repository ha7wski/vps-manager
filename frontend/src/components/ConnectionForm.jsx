// Connection screen shown while disconnected.
// Submits credentials to POST /connect and, on success, hands control back to
// App via the onConnected callback.

import { useState } from "react";
import { Eye, EyeOff, Server, Loader2 } from "lucide-react";
import { apiFetch } from "../api";

export default function ConnectionForm({ onConnected }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch("/connect", {
        method: "POST",
        body: JSON.stringify({
          host: host.trim(),
          port: Number(port),
          username: username.trim(),
          password,
        }),
      });
      onConnected(result); // { status, host, username }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center bg-gray-950 text-gray-200">
      {/* Draggable top strip so the window can be moved before connecting
          (hiddenInset title bar has no native drag region). */}
      <div
        className="absolute inset-x-0 top-0 h-8"
        style={{ WebkitAppRegion: "drag" }}
      />
      <form
        onSubmit={handleSubmit}
        className="w-[380px] rounded-xl border border-gray-800 bg-gray-900 p-8 shadow-2xl"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
            <Server className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">VPS Manager</h1>
            <p className="text-xs text-gray-500">Connect to your server</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Host">
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={inputClass}
              autoComplete="off"
              required
            />
          </Field>

          <Field label="Port">
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className={inputClass}
              min="1"
              max="65535"
              required
            />
          </Field>

          <Field label="Username">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              autoComplete="off"
              required
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-10`}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-300"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Connecting…" : "Connect"}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}
