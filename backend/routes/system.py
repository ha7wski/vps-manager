"""System metrics and process management over SSH.

Metrics are read primarily from /proc (stable across Ubuntu versions) in a
single batched command to minimise SSH round-trips. CPU usage is sampled from
two /proc/stat reads 0.5s apart.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ssh_client import NotConnectedError, get_client

router = APIRouter(prefix="/system", tags=["system"])

# Pseudo/virtual filesystems we never want to show as "disks".
EXCLUDED_FSTYPES = {"tmpfs", "devtmpfs", "udev", "overlay", "squashfs", "proc", "sysfs", "cgroup", "cgroup2"}

# One batched command. Section markers let us split the output reliably.
METRICS_CMD = (
    "echo '#CPU1'; grep '^cpu ' /proc/stat; "
    "sleep 0.5; "
    "echo '#CPU2'; grep '^cpu ' /proc/stat; "
    "echo '#NPROC'; nproc; "
    "echo '#MEM'; cat /proc/meminfo; "
    "echo '#DF'; df -P -T -B1; "
    "echo '#UP'; cat /proc/uptime; "
    "echo '#LOAD'; cat /proc/loadavg"
)


def _require_client():
    try:
        return get_client()
    except NotConnectedError as exc:
        raise HTTPException(409, detail=str(exc)) from exc


def _split_sections(output: str) -> dict[str, list[str]]:
    """Split batched output into { marker: [lines] } using '#MARKER' lines."""
    sections: dict[str, list[str]] = {}
    current = None
    for line in output.splitlines():
        if line.startswith("#") and line[1:] in {"CPU1", "CPU2", "NPROC", "MEM", "DF", "UP", "LOAD"}:
            current = line[1:]
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    return sections


def _cpu_times(line: str) -> tuple[int, int]:
    """Return (idle_all, total) from a '/proc/stat' cpu line."""
    parts = [int(x) for x in line.split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)  # idle + iowait
    return idle, sum(parts)


def _format_uptime(seconds: float) -> str:
    s = int(seconds)
    days, s = divmod(s, 86400)
    hours, s = divmod(s, 3600)
    minutes, _ = divmod(s, 60)
    out = []
    if days:
        out.append(f"{days}d")
    if hours or days:
        out.append(f"{hours}h")
    out.append(f"{minutes}m")
    return " ".join(out)


@router.get("/metrics")
def metrics():
    client = _require_client()
    out, err, code = client.run(METRICS_CMD, timeout=20)
    if code != 0 and not out:
        raise HTTPException(500, detail=f"Failed to collect metrics: {err.strip() or 'unknown error'}")

    s = _split_sections(out)

    # --- CPU ---
    cpu_percent = 0.0
    try:
        idle1, total1 = _cpu_times(s["CPU1"][0])
        idle2, total2 = _cpu_times(s["CPU2"][0])
        dt = total2 - total1
        di = idle2 - idle1
        if dt > 0:
            cpu_percent = round((1 - di / dt) * 100, 1)
    except (KeyError, IndexError, ValueError):
        pass

    cores = 1
    try:
        cores = int(s["NPROC"][0].strip())
    except (KeyError, IndexError, ValueError):
        pass

    # --- Memory (kB in /proc/meminfo) ---
    meminfo = {}
    for line in s.get("MEM", []):
        if ":" in line:
            key, _, rest = line.partition(":")
            meminfo[key.strip()] = int(rest.strip().split()[0]) * 1024  # bytes
    mem_total = meminfo.get("MemTotal", 0)
    mem_available = meminfo.get("MemAvailable", meminfo.get("MemFree", 0))
    mem_used = max(mem_total - mem_available, 0)
    mem_percent = round(mem_used / mem_total * 100, 1) if mem_total else 0.0

    # --- Disks (df -P -T -B1) ---
    disks = []
    df_lines = s.get("DF", [])
    for line in df_lines[1:]:  # skip header
        parts = line.split(None, 6)
        if len(parts) < 7:
            continue
        source, fstype, size, used, avail, _pcent, target = parts
        if fstype in EXCLUDED_FSTYPES or source.startswith("/dev/loop"):
            continue
        try:
            size_b, used_b, avail_b = int(size), int(used), int(avail)
        except ValueError:
            continue
        if size_b == 0:
            continue
        disks.append(
            {
                "mount": target,
                "device": source,
                "fstype": fstype,
                "total": size_b,
                "used": used_b,
                "free": avail_b,
                "percent": round(used_b / size_b * 100, 1),
            }
        )

    # --- Uptime + load ---
    uptime_seconds = 0.0
    try:
        uptime_seconds = float(s["UP"][0].split()[0])
    except (KeyError, IndexError, ValueError):
        pass

    load = {"1m": 0.0, "5m": 0.0, "15m": 0.0}
    try:
        l1, l5, l15 = s["LOAD"][0].split()[:3]
        load = {"1m": float(l1), "5m": float(l5), "15m": float(l15)}
    except (KeyError, IndexError, ValueError):
        pass

    return {
        "cpu": {"percent": cpu_percent, "cores": cores},
        "memory": {"total": mem_total, "used": mem_used, "free": mem_available, "percent": mem_percent},
        "disks": disks,
        "uptime": {"seconds": uptime_seconds, "human": _format_uptime(uptime_seconds)},
        "load": load,
    }


@router.get("/processes")
def processes():
    client = _require_client()
    # comm avoids spaces in the name; --sort=-pcpu gives CPU-descending order.
    cmd = "ps -eo pid,user:32,pcpu,pmem,stat,comm --sort=-pcpu --no-headers | head -n 50"
    out, err, code = client.run(cmd, timeout=15)
    if code != 0 and not out:
        raise HTTPException(500, detail=f"Failed to list processes: {err.strip() or 'unknown error'}")

    procs = []
    for line in out.splitlines():
        parts = line.split(None, 5)
        if len(parts) < 6:
            continue
        pid, user, pcpu, pmem, stat, name = parts
        try:
            procs.append(
                {
                    "pid": int(pid),
                    "name": name,
                    "user": user,
                    "cpu_percent": float(pcpu),
                    "mem_percent": float(pmem),
                    "status": stat,
                }
            )
        except ValueError:
            continue

    return {"processes": procs}


class KillRequest(BaseModel):
    pid: int = Field(...)


@router.post("/kill")
def kill(req: KillRequest):
    client = _require_client()
    if req.pid <= 0 or req.pid == 1:
        raise HTTPException(403, detail=f"Refusing to signal PID {req.pid}")

    # Check existence first so a missing process is a clean 404. With 2>&1 the
    # diagnostic message ("No such process" / "Operation not permitted") lands
    # in stdout, so one call distinguishes both cases.
    check_out, _, exists_code = client.run(f"kill -0 {req.pid} 2>&1")
    if exists_code != 0:
        if "no such process" in check_out.lower():
            raise HTTPException(404, detail=f"No process with PID {req.pid}")
        raise HTTPException(403, detail=f"Not permitted to signal PID {req.pid}")

    out, _, code = client.run(f"kill -TERM {req.pid} 2>&1; echo EXIT:$?")
    if "EXIT:0" not in out:
        if "no such process" in out.lower():
            raise HTTPException(404, detail=f"No process with PID {req.pid}")
        if "not permitted" in out.lower() or "operation not permitted" in out.lower():
            raise HTTPException(403, detail=f"Not permitted to signal PID {req.pid}")
        raise HTTPException(500, detail=f"Failed to kill PID {req.pid}: {out.strip()}")

    return {"status": "terminated", "pid": req.pid}
