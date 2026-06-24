// System dashboard: metric cards (CPU sparkline, RAM/disk bars, uptime/load)
// + a sortable, filterable process table with a kill action.
//
// Metrics poll every 5s, processes every 10s; a Pause/Resume toggle gates both.

import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { Cpu, MemoryStick, HardDrive, Clock, Pause, Play, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { systemApi } from "../api";
import { formatSize } from "../utils/files";

// Color tier for a usage percentage.
function tier(pct) {
  if (pct < 60) return { bar: "bg-emerald-500", text: "text-emerald-400" };
  if (pct < 85) return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-red-500", text: "text-red-400" };
}

const CPU_HISTORY = 20;

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [procs, setProcs] = useState([]);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState({ key: "cpu_percent", dir: "desc" });
  const [filter, setFilter] = useState("");
  const [killing, setKilling] = useState(null); // process pending confirmation

  const fetchMetrics = useCallback(async () => {
    try {
      const m = await systemApi.metrics();
      setMetrics(m);
      setCpuHistory((h) => [...h, { v: m.cpu.percent }].slice(-CPU_HISTORY));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchProcs = useCallback(async () => {
    try {
      const res = await systemApi.processes();
      setProcs(res.processes);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Metrics polling (5s).
  useEffect(() => {
    if (paused) return;
    fetchMetrics();
    const id = setInterval(fetchMetrics, 5000);
    return () => clearInterval(id);
  }, [paused, fetchMetrics]);

  // Process polling (10s).
  useEffect(() => {
    if (paused) return;
    fetchProcs();
    const id = setInterval(fetchProcs, 10000);
    return () => clearInterval(id);
  }, [paused, fetchProcs]);

  async function confirmKill() {
    const p = killing;
    setKilling(null);
    try {
      await systemApi.kill(p.pid);
      fetchProcs();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "user" || key === "status" ? "asc" : "desc" }));
  }

  const filtered = procs.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  const sortedProcs = [...filtered].sort((a, b) => {
    const k = sort.key;
    let cmp;
    if (typeof a[k] === "number") cmp = a[k] - b[k];
    else cmp = String(a[k]).localeCompare(String(b[k]));
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">System Dashboard</h2>
        <button
          onClick={() => setPaused((p) => !p)}
          className="flex items-center gap-2 rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {!metrics ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4">
          {/* CPU */}
          <Card icon={<Cpu className="h-4 w-4 text-sky-400" />} title="CPU" right={`${metrics.cpu.cores} cores`}>
            <div className="flex items-end justify-between">
              <span className={`text-3xl font-semibold ${tier(metrics.cpu.percent).text}`}>
                {metrics.cpu.percent}%
              </span>
              <div className="h-12 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cpuHistory}>
                    <YAxis domain={[0, 100]} hide />
                    <Line type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          {/* RAM */}
          <Card icon={<MemoryStick className="h-4 w-4 text-violet-400" />} title="Memory">
            <div className="mb-1 flex justify-between text-sm">
              <span className={tier(metrics.memory.percent).text}>{metrics.memory.percent}%</span>
              <span className="text-gray-500">
                {formatSize(metrics.memory.used)} / {formatSize(metrics.memory.total)}
              </span>
            </div>
            <ProgressBar percent={metrics.memory.percent} />
          </Card>

          {/* Disk */}
          <Card icon={<HardDrive className="h-4 w-4 text-amber-400" />} title="Disk">
            <div className="space-y-2">
              {metrics.disks.length === 0 && <div className="text-sm text-gray-600">No partitions</div>}
              {metrics.disks.map((d) => (
                <div key={d.mount}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-mono text-gray-300">{d.mount}</span>
                    <span className="text-gray-500">
                      {formatSize(d.used)} / {formatSize(d.total)} ({d.percent}%)
                    </span>
                  </div>
                  <ProgressBar percent={d.percent} />
                </div>
              ))}
            </div>
          </Card>

          {/* Uptime + load */}
          <Card icon={<Clock className="h-4 w-4 text-emerald-400" />} title="Uptime & Load">
            <div className="text-2xl font-semibold text-gray-100">{metrics.uptime.human}</div>
            <div className="mt-3 flex gap-4 text-sm">
              <LoadStat label="1m" value={metrics.load["1m"]} cores={metrics.cpu.cores} />
              <LoadStat label="5m" value={metrics.load["5m"]} cores={metrics.cpu.cores} />
              <LoadStat label="15m" value={metrics.load["15m"]} cores={metrics.cpu.cores} />
            </div>
          </Card>
        </div>
      )}

      {/* Process table */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">Processes</h3>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
          className="w-56 rounded-md border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-emerald-500"
        />
      </div>

      <div className="mt-2 overflow-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-950 text-xs text-gray-500">
            <tr>
              <Th label="PID" col="pid" sort={sort} onClick={toggleSort} />
              <Th label="Name" col="name" sort={sort} onClick={toggleSort} />
              <Th label="User" col="user" sort={sort} onClick={toggleSort} />
              <Th label="CPU%" col="cpu_percent" sort={sort} onClick={toggleSort} />
              <Th label="MEM%" col="mem_percent" sort={sort} onClick={toggleSort} />
              <Th label="Status" col="status" sort={sort} onClick={toggleSort} />
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedProcs.map((p) => (
              <tr key={p.pid} className="border-t border-gray-800 hover:bg-gray-800/50">
                <td className="px-3 py-1.5 font-mono text-gray-400">{p.pid}</td>
                <td className="px-3 py-1.5 text-gray-200">{p.name}</td>
                <td className="px-3 py-1.5 text-gray-400">{p.user}</td>
                <td className={`px-3 py-1.5 font-mono ${tier(p.cpu_percent).text}`}>{p.cpu_percent.toFixed(1)}</td>
                <td className="px-3 py-1.5 font-mono text-gray-400">{p.mem_percent.toFixed(1)}</td>
                <td className="px-3 py-1.5 font-mono text-gray-500">{p.status}</td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    onClick={() => setKilling(p)}
                    className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-950/50"
                  >
                    Kill
                  </button>
                </td>
              </tr>
            ))}
            {sortedProcs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-gray-600">No processes</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Kill confirmation */}
      {killing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50" onClick={() => setKilling(null)}>
          <div className="w-[360px] rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Kill process</h3>
              <button onClick={() => setKilling(null)} className="text-gray-500 hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-400">
              Send <span className="font-mono text-gray-200">SIGTERM</span> to{" "}
              <span className="font-mono text-gray-200">{killing.name}</span> (PID {killing.pid})?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setKilling(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={confirmKill} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500">
                Kill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, right, children }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          {icon}
          {title}
        </div>
        {right && <span className="text-xs text-gray-500">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ percent }) {
  const t = tier(percent);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
      <div className={`h-full ${t.bar} transition-all`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function LoadStat({ label, value, cores }) {
  // Load relative to core count: >1.0 per core is the saturation point.
  const pct = cores ? (value / cores) * 100 : 0;
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-mono ${tier(pct).text}`}>{value.toFixed(2)}</div>
    </div>
  );
}

function Th({ label, col, sort, onClick }) {
  const active = sort.key === col;
  return (
    <th className="px-3 py-2 font-medium">
      <button onClick={() => onClick(col)} className="flex items-center gap-1 hover:text-gray-300">
        {label}
        {active && (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}
