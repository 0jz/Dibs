#!/usr/bin/env python3
"""Dibs test agent.

Runs on the machine being tested (Windows, Python 3.9+, standard library only).

  Double-click (dibs-agent.exe) or run with no arguments: it asks for the code.
  Store test:   python dibs_agent.py test   --code ABC123
  Buyer check:  python dibs_agent.py verify --listing <listing-id>

The server comes from --server, the DIBS_SERVER environment variable, a dibs_server.txt
file next to the agent, or the DEFAULT_SERVER constant below (set at build time).
"""

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

# ---------------------------------------------------------------- helpers


def run(cmd, timeout=60):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return out.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def ps_json(command):
    """Run a PowerShell pipeline and return its output as a list of dicts."""
    raw = run(["powershell", "-NoProfile", "-Command",
               f"@({command}) | ConvertTo-Json -Depth 4 -Compress"])
    if not raw:
        return []
    data = json.loads(raw)
    return data if isinstance(data, list) else [data]


# Public site the packaged agent talks to. Empty in the repo; the exe build sets it.
DEFAULT_SERVER = ""

# Durations and fallback abort temperatures. Keep in sync with web/lib/tests.ts.
# Prefer nvidia-smi GPU Slowdown Temp, then the shop model table, then these.
TIERS = {
    "light": {"core": 15, "memory": 0, "cpu": 6, "abort_laptop": 80, "abort_desktop": 85},
    "standard": {"core": 60, "memory": 20, "cpu": 15, "abort_laptop": 80, "abort_desktop": 88},
    "bench": {"core": 180, "memory": 180, "cpu": 15, "abort_laptop": 80, "abort_desktop": 88},
}
# Official Open Data scene. Pin matches web/lib/performance.ts.
BLENDER_VERSION = "4.5.0"
BLENDER_SCENE = "junkshop"
BLENDER_TIMEOUT_S = 300
LOAD_SKIPPED = "Not on AC power, so the GPU stress was not started."
SAMPLE_FIELDS = ["temperature.gpu", "utilization.gpu", "power.draw", "clocks.gr",
                 "clocks_event_reasons.hw_thermal_slowdown", "clocks_event_reasons.sw_thermal_slowdown"]
GPU_FIELDS = ["name", "uuid", "vbios_version", "memory.total", "driver_version", "clocks.max.gr"]


def nvidia(fields):
    raw = run(["nvidia-smi", f"--query-gpu={','.join(fields)}", "--format=csv,noheader,nounits"], timeout=10)
    rows = []
    for line in raw.splitlines():
        values = [v.strip() for v in line.split(",")]
        if len(values) == len(fields):
            rows.append(dict(zip(fields, values)))
    return rows


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def nvidia_query_block():
    """Parse nvidia-smi -q for slowdown temperature and power limit (first GPU)."""
    raw = run(["nvidia-smi", "-q", "-d", "TEMPERATURE,POWER"], timeout=20)
    slowdown = None
    power_limit = None
    for line in raw.splitlines():
        text = line.strip()
        low = text.lower()
        if "gpu slowdown temp" in low or "slowdown temperature" in low:
            slowdown = num(text.split(":")[-1].replace("C", "").strip())
        elif text.lower().startswith("power limit") or "current power limit" in low:
            power_limit = num(text.split(":")[-1].replace("W", "").strip())
        elif "enforced power limit" in low and power_limit is None:
            power_limit = num(text.split(":")[-1].replace("W", "").strip())
    return {"slowdownTempC": slowdown, "powerLimitW": power_limit}


def resolve_abort(server, identity, tier_fallback):
    """Driver slowdown first, then /api/limits model table, then tier fallback."""
    device = identity["deviceType"]
    gpu_name = identity["gpus"][0]["name"] if identity["gpus"] else ""
    driver = nvidia_query_block() if identity["gpus"] else {"slowdownTempC": None, "powerLimitW": None}
    model = get_json(server, f"/api/limits?q={urllib.parse.quote(gpu_name)}&kind=gpu&device={device}") if gpu_name else {}
    warn = num(model.get("warnC"))
    stop = num(model.get("stopC"))
    source = model.get("source") or "fallback"
    slowdown = driver.get("slowdownTempC")
    if slowdown is not None and 40 < slowdown < 120:
        abort = slowdown
        warn_c = min(warn, slowdown - 5) if warn is not None else slowdown - 8
        source = "driver"
    elif stop is not None:
        abort = stop
        warn_c = warn if warn is not None else stop - 5
    else:
        abort = tier_fallback
        warn_c = tier_fallback - 5
        source = "fallback"
    return {
        "abortTempC": int(round(abort)),
        "warnTempC": int(round(warn_c)),
        "source": source,
        "powerLimitW": driver.get("powerLimitW"),
        "slowdownTempC": slowdown,
    }


def find_benchmark_cli():
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("benchmark-launcher-cli.exe", "benchmark-launcher-cli"):
        local = os.path.join(here, name)
        if os.path.isfile(local):
            return local
        found = shutil.which(name)
        if found:
            return found
    return None


def _parse_blender_stats(payload):
    """Find the stats block of the launcher JSON (shape varies by version).

    Returns (stats, scene_id). The score is samples_per_minute: the scene renders for a
    fixed time limit, so total_render_time is nearly the same on every card.
    """
    if isinstance(payload, list):
        for item in payload:
            stats, scene_id = _parse_blender_stats(item)
            if stats:
                return stats, scene_id
        return None, None
    if not isinstance(payload, dict):
        return None, None
    stats = payload.get("stats") or payload.get("result")
    if isinstance(stats, dict) and (
        num(stats.get("samples_per_minute")) or num(stats.get("total_render_time"))
    ):
        scene = payload.get("scene") or {}
        scene_id = (scene.get("checksum") or scene.get("id")) if isinstance(scene, dict) else None
        return stats, scene_id
    for nested in payload.values():
        if isinstance(nested, (dict, list)):
            found, scene_id = _parse_blender_stats(nested)
            if found:
                return found, scene_id
    return None, None


def samples_per_minute(stats):
    value = num(stats.get("samples_per_minute"))
    if value and value > 0:
        return value
    samples, took = num(stats.get("number_of_samples")), num(stats.get("time_for_samples"))
    if samples and took and took > 0:
        return samples / took * 60
    return None


def run_blender_junkshop(device_type, sampler):
    """Official Open Data junkshop via benchmark-launcher-cli. Cap BLENDER_TIMEOUT_S."""
    cli = find_benchmark_cli()
    note_base = {
        "scene": BLENDER_SCENE,
        "api": device_type,
        "blenderVersion": BLENDER_VERSION,
        "sceneId": None,
        "seconds": None,
        "samplesPerMin": None,
        "ran": False,
        "aborted": False,
        "note": "",
    }
    if not cli:
        note_base["note"] = "Blender Benchmark was not run, so there is no performance score. Install benchmark-launcher-cli on the shop PC."
        return note_base
    if sampler.abort:
        note_base["aborted"] = True
        note_base["note"] = "Junkshop was not started. The load was already stopped for heat."
        return note_base
    cmd = [cli, "benchmark", BLENDER_SCENE, "--blender-version", BLENDER_VERSION,
           "--device-type", device_type, "--json"]
    print(f"      blender junkshop ({device_type}, Blender {BLENDER_VERSION})...")
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=BLENDER_TIMEOUT_S,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired:
        note_base["aborted"] = True
        note_base["note"] = f"Junkshop hit the {BLENDER_TIMEOUT_S}s cap. No performance score."
        return note_base
    except FileNotFoundError:
        note_base["note"] = "Blender Benchmark was not run, so there is no performance score. Install benchmark-launcher-cli on the shop PC."
        return note_base
    if sampler.abort:
        note_base["aborted"] = True
        note_base["note"] = "Junkshop was stopped early for heat. No performance score."
        return note_base
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    payload = None
    if out:
        try:
            payload = json.loads(out)
        except json.JSONDecodeError:
            # Some builds print logs then a JSON object; take the last {...} block.
            start, end = out.rfind("{"), out.rfind("}")
            if start != -1 and end > start:
                try:
                    payload = json.loads(out[start : end + 1])
                except json.JSONDecodeError:
                    payload = None
            if payload is None and out.rfind("[") != -1:
                start, end = out.rfind("["), out.rfind("]")
                if start != -1 and end > start:
                    try:
                        payload = json.loads(out[start : end + 1])
                    except json.JSONDecodeError:
                        payload = None
    stats, scene_id = _parse_blender_stats(payload)
    spm = samples_per_minute(stats) if stats else None
    if spm is None:
        note_base["note"] = "Blender Benchmark ran but did not print samples per minute." + (f" {err[:160]}" if err else "")
        return note_base
    seconds = num(stats.get("total_render_time"))
    note_base.update({
        "seconds": round(seconds, 2) if seconds else None,
        "samplesPerMin": round(spm, 1),
        "sceneId": scene_id,
        "ran": True,
        "note": f"Official junkshop · {device_type} · Blender {BLENDER_VERSION}",
    })
    print(f"      junkshop {spm:.0f} samples/min ({device_type})")
    return note_base


def get_json(server, path):
    req = urllib.request.Request(server.rstrip("/") + path)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode() or "{}")
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return {}


def post(server, path, payload, quiet=False):
    req = urllib.request.Request(server.rstrip("/") + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if not quiet:
            print(f"  ! server said {e.code}: {body}")
        raise
    except urllib.error.URLError as e:
        if not quiet:
            print(f"  ! cannot reach {server}: {e.reason}")
        raise


# ---------------------------------------------------------------- hardware identity


def battery_report():
    path = os.path.join(tempfile.gettempdir(), "dibs_battery.xml")
    run(["powercfg", "/batteryreport", "/xml", "/output", path], timeout=30)
    try:
        import xml.etree.ElementTree as ET
        root = ET.parse(path).getroot()
        ns = {"b": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
        bat = root.find(".//b:Battery", ns) if ns else root.find(".//Battery")
        if bat is None:
            return None

        def field(name):
            el = bat.find(f"b:{name}", ns) if ns else bat.find(name)
            return el.text if el is not None else None

        design, full = num(field("DesignCapacity")), num(field("FullChargeCapacity"))
        if not design or not full:
            return None
        serial = (field("SerialNumber") or field("Id") or "").strip() or None
        return {"designMwh": int(design), "fullMwh": int(full),
                "healthPct": round(min(full / design, 1.0) * 100, 1),
                "cycles": int(num(field("CycleCount")) or 0),
                "serial": serial}
    except Exception:
        return None
    finally:
        if os.path.exists(path):
            os.remove(path)


def power_source():
    """True on AC, False on battery, None when Windows has no battery status (a desktop)."""
    raw = run(["powershell", "-NoProfile", "-Command",
               "$b = @(Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue); "
               "if ($b.Count -eq 0) { 'none' } elseif ($b | Where-Object { -not $_.PowerOnline }) { 'battery' } else { 'ac' }"],
              timeout=25).strip().lower()
    if raw == "ac":
        return True
    if raw == "battery":
        return False
    return None


def collect_identity():
    system = (ps_json("Get-CimInstance Win32_ComputerSystem | Select Manufacturer,Model,PCSystemType") or [{}])[0]
    bios = (ps_json("Get-CimInstance Win32_BIOS | Select SerialNumber") or [{}])[0]
    cpu = (ps_json("Get-CimInstance Win32_Processor | Select Name,NumberOfCores,NumberOfLogicalProcessors,ProcessorId") or [{}])[0]
    ram = ps_json("Get-CimInstance Win32_PhysicalMemory | Select Capacity,Speed,Manufacturer,PartNumber")
    disks = ps_json("Get-PhysicalDisk | Select FriendlyName,MediaType,HealthStatus,Size,SerialNumber")
    os_name = run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_OperatingSystem).Caption"])

    gpus = [{
        "name": g["name"], "uuid": g["uuid"], "vbios": g["vbios_version"],
        "vramMb": int(num(g["memory.total"]) or 0), "driver": g["driver_version"],
        "maxClockMhz": int(num(g["clocks.max.gr"]) or 0),
    } for g in nvidia(GPU_FIELDS)]

    battery = battery_report()
    is_laptop = system.get("PCSystemType") == 2 or battery is not None

    return {
        "deviceType": "laptop" if is_laptop else "desktop",
        "system": {"manufacturer": (system.get("Manufacturer") or "").strip(),
                   "model": (system.get("Model") or "").strip(),
                   "biosSerial": (bios.get("SerialNumber") or "").strip()},
        "cpu": {"name": (cpu.get("Name") or "").strip(), "cores": cpu.get("NumberOfCores"),
                "threads": cpu.get("NumberOfLogicalProcessors"),
                "processorId": (cpu.get("ProcessorId") or "").strip()},
        "ram": {"totalGb": round(sum(int(m.get("Capacity") or 0) for m in ram) / 2**30),
                "modules": [{"capacityGb": round(int(m.get("Capacity") or 0) / 2**30), "speedMts": m.get("Speed"),
                             "manufacturer": (m.get("Manufacturer") or "").strip(),
                             "part": (m.get("PartNumber") or "").strip()} for m in ram]},
        "gpus": gpus,
        "disks": [{"model": (d.get("FriendlyName") or "").strip(), "type": d.get("MediaType"),
                   "health": d.get("HealthStatus"), "sizeGb": round(int(d.get("Size") or 0) / 1e9),
                   "serial": (d.get("SerialNumber") or "").strip()} for d in disks],
        "battery": battery,
        "os": os_name,
    }


def device_hash(identity):
    """Fingerprint of the physical device: BIOS serial + every GPU's UUID and VBIOS."""
    key = {
        "bios": identity["system"]["biosSerial"],
        "gpus": sorted(f'{g["uuid"]}|{g["vbios"]}' for g in identity["gpus"]),
    }
    return "0x" + hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()


def part_hashes(identity):
    """One fingerprint per GPU: UUID + VBIOS only, so a card still matches after it moves to another PC."""
    return ["0x" + hashlib.sha256(json.dumps({"gpu": f'{g["uuid"]}|{g["vbios"]}'}).encode()).hexdigest()
            for g in identity["gpus"]]


def _sha(payload):
    return "0x" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def fingerprints(identity):
    """Stable ids for the whole PC and for one part. CPU, RAM, disk and battery ids are weaker than a GPU UUID."""
    cpu_id = (identity["cpu"].get("processorId") or "").strip()
    modules = sorted(
        f'{m.get("manufacturer") or ""}|{m.get("part") or ""}|{m.get("capacityGb")}'
        for m in identity["ram"]["modules"]
    )
    ram_id = "|".join(modules) if any((m.get("part") or "").strip() for m in identity["ram"]["modules"]) else ""
    disks = []
    for disk in identity["disks"]:
        serial = (disk.get("serial") or "").strip()
        disks.append(_sha({"disk": serial}) if serial else None)
    battery = identity.get("battery") or {}
    battery_id = (battery.get("serial") or "").strip() if battery else ""
    return {
        "device": device_hash(identity),
        "gpus": part_hashes(identity),
        "cpu": _sha({"cpu": cpu_id}) if cpu_id else None,
        "ram": _sha({"ram": ram_id}) if ram_id else None,
        "disks": disks,
        "battery": _sha({"battery": battery_id}) if battery_id else None,
    }


USED = "This code was already used. Start a new test in the staff panel."


def run_hashrate(sampler, seconds):
    """Optional local benchmark. Prints mhs=<number> and, if it knows one, ref=<number>. No pool."""
    exe = shutil.which("dibs_hashrate")
    if not exe:
        return None
    proc = subprocess.Popen(
        [exe], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    deadline = time.time() + seconds
    try:
        while time.time() < deadline and not sampler.abort:
            remote = get_json(sampler.server, f"/api/agent/{sampler.code}")
            if remote.get("abort"):
                sampler.abort = True
                break
            if proc.poll() is not None:
                break
            time.sleep(0.5)
    finally:
        if proc.poll() is None:
            proc.kill()
        try:
            out, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            out = ""
    mh = ref = None
    for line in (out or "").splitlines():
        line = line.strip().lower()
        if line.startswith("mhs="):
            mh = num(line.split("=", 1)[1])
        elif line.startswith("ref="):
            ref = num(line.split("=", 1)[1])
    return {"mhPerS": mh, "referenceMhS": ref}


# ---------------------------------------------------------------- CPU benchmark


def _work_chunk():
    acc = 0
    for i in range(40_000):
        acc = (acc + i * i) % 1_000_003
    return acc


def _cpu_worker(seconds, queue):
    end, count = time.perf_counter() + seconds, 0
    while time.perf_counter() < end:
        _work_chunk()
        count += 1
    queue.put(count)


def cpu_benchmark(single_s, multi_s):
    q = mp.Queue()
    _cpu_worker(single_s, q)
    single = q.get() / single_s

    threads = os.cpu_count() or 1
    procs = [mp.Process(target=_cpu_worker, args=(multi_s, q)) for _ in range(threads)]
    for p in procs:
        p.start()
    multi = sum(q.get() for _ in procs) / multi_s
    for p in procs:
        p.join()
    return {"singleScore": round(single * 10), "multiScore": round(multi * 10), "threads": threads}


# ---------------------------------------------------------------- telemetry sampler


class Sampler(threading.Thread):
    def __init__(self, server, code, abort_c):
        super().__init__(daemon=True)
        self.server, self.code, self.abort_c = server, code, abort_c
        self.phase = "idle"
        self.samples = []
        self.abort = False
        self.hot = False
        self.stopped = threading.Event()

    def run(self):
        t0 = time.time()
        while not self.stopped.is_set():
            rows = nvidia(SAMPLE_FIELDS)
            if rows:
                g = rows[0]
                s = {"t": round(time.time() - t0, 1), "phase": self.phase,
                     "gpuTemp": num(g["temperature.gpu"]), "gpuUtil": num(g["utilization.gpu"]),
                     "gpuPower": num(g["power.draw"]), "gpuClock": num(g["clocks.gr"]),
                     "throttle": "Active" in (g["clocks_event_reasons.hw_thermal_slowdown"],
                                              g["clocks_event_reasons.sw_thermal_slowdown"])}
                self.samples.append(s)
                if s["gpuTemp"] is not None and s["gpuTemp"] >= self.abort_c:
                    self.abort = True
                    self.hot = True
                    try:
                        post(self.server, f"/api/agent/{self.code}", {"type": "abort"}, quiet=True)
                    except Exception:
                        pass
                try:
                    post(self.server, f"/api/agent/{self.code}", {"type": "samples", "samples": [s]}, quiet=True)
                except Exception:
                    pass
            self.stopped.wait(1.0)


def gpu_summary(samples):
    load = [s for s in samples if s["phase"] in ("gpu", "memory") and s["gpuTemp"] is not None]
    if not load:
        return None

    def vals(key):
        return [s[key] for s in load if s[key] is not None]

    temps, utils, power, clocks = vals("gpuTemp"), vals("gpuUtil"), vals("gpuPower"), vals("gpuClock")
    return {
        "durationS": round(load[-1]["t"] - load[0]["t"]),
        "maxTemp": max(temps), "avgTemp": round(sum(temps) / len(temps), 1),
        "avgUtil": round(sum(utils) / len(utils)) if utils else None,
        "maxPowerW": round(max(power), 1) if power else None,
        "maxClockMhz": max(clocks) if clocks else None,
        "throttleSamples": sum(1 for s in load if s["throttle"]),
    }


# ---------------------------------------------------------------- commands


def wait_for(sampler, seconds):
    """Sleep in short steps so a hot GPU, or the Stop button, ends the load early."""
    end = time.time() + seconds
    while time.time() < end:
        if sampler.abort:
            print(f"      stopped: GPU reached {sampler.abort_c}C")
            return True
        info = get_json(sampler.server, f"/api/agent/{sampler.code}")
        if info.get("abort"):
            sampler.abort = True
            print("      stopped from the stress window")
            return True
        time.sleep(0.5)
    return sampler.abort


def shorten(requested, cap, fallback):
    """A flag may shorten a tier. It cannot run longer than the tier allows."""
    if requested is None:
        return fallback
    return max(0, min(int(requested), cap))


def run_memtest(sampler, seconds):
    """Bench only. Returns True when memtest_vulkan is installed and was run, stopping early if the GPU is too hot."""
    exe = shutil.which("memtest_vulkan")
    if not exe or seconds <= 0:
        return False
    print(f"      memtest_vulkan for {seconds}s")
    proc = subprocess.Popen([exe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    deadline = time.time() + seconds
    try:
        while time.time() < deadline:
            if sampler.hot:
                break
            info = get_json(sampler.server, f"/api/agent/{sampler.code}")
            if info.get("abort"):
                sampler.abort = True
                break
            try:
                proc.wait(timeout=0.5)
                break
            except subprocess.TimeoutExpired:
                continue
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)
    return True


def cmd_test(args):
    server, code = args.server, args.code.upper()
    print(f"Dibs test agent  ->  {server}  (session {code})\n")

    remote = get_json(server, f"/api/agent/{code}")
    if remote.get("status") not in (None, "waiting"):
        print(USED)
        return

    print("[1/4] Reading hardware...")
    identity = collect_identity()
    is_laptop = identity["deviceType"] == "laptop"
    requested = args.tier or remote.get("stressTier")
    tier = requested if requested in TIERS else ("light" if is_laptop else "standard")
    spec = TIERS[tier]
    ac = power_source()
    # A desktop with no battery is the shop bench. A laptop stress runs only on AC.
    plugged = True if not is_laptop else ac is True
    tier_fallback = spec["abort_laptop"] if is_laptop else spec["abort_desktop"]
    limits = resolve_abort(server, identity, tier_fallback)
    abort_c = limits["abortTempC"]
    profile = "laptop" if is_laptop else "pc"

    dhash = device_hash(identity)
    try:
        post(server, f"/api/agent/{code}", {
            "type": "identity", "identity": identity, "deviceHash": dhash,
            "partHashes": part_hashes(identity), "fingerprints": fingerprints(identity),
            "stressTier": tier, "onAc": ac, "abortTempC": abort_c,
        })
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(USED)
            return
        raise
    print(f"      {identity['system']['manufacturer']} {identity['system']['model']}")
    print(f"      CPU {identity['cpu']['name']}")
    for g in identity["gpus"]:
        print(f"      GPU {g['name']} ({g['vramMb']} MB)")
    print(f"      tier {tier}  ({'laptop' if is_laptop else 'desktop'}, stop at {abort_c}C via {limits['source']})")
    if limits.get("powerLimitW"):
        print(f"      power limit {limits['powerLimitW']} W")
    print(f"      fingerprint {dhash[:18]}...")

    sampler = Sampler(server, code, abort_c)
    sampler.start()

    cpu_cap = spec["cpu"] if plugged else TIERS["light"]["cpu"]
    cpu_seconds = shorten(args.cpu_seconds, cpu_cap, cpu_cap)
    gpu_seconds = shorten(args.gpu_seconds, spec["core"], spec["core"])
    memory_default = spec["memory"]
    memory_seconds = shorten(args.memory_seconds, spec["memory"], memory_default)
    load_skipped = None
    vram_tool = None

    if not plugged:
        load_skipped = LOAD_SKIPPED
        gpu_seconds = 0
        memory_seconds = 0
        print(f"      {LOAD_SKIPPED}")

    print(f"[2/4] CPU benchmark ({cpu_seconds}s)...")
    sampler.phase = "cpu"
    post(server, f"/api/agent/{code}", {"type": "phase", "phase": "cpu"})
    cpu = cpu_benchmark(single_s=max(3, cpu_seconds // 3), multi_s=max(3, cpu_seconds))
    print(f"      single {cpu['singleScore']}  /  multi {cpu['multiScore']}")
    if sampler.abort:
        gpu_seconds = 0
        memory_seconds = 0

    gpu = None
    if identity["gpus"] and gpu_seconds and not sampler.abort:
        print(f"[3/4] GPU stress ({gpu_seconds}s, stops at {abort_c}C) - a browser window opens, keep it in front...")
        sampler.phase = "gpu"
        post(server, f"/api/agent/{code}", {"type": "phase", "phase": "gpu"})
        webbrowser.open(
            f"{server.rstrip('/')}/stress?code={code}&seconds={gpu_seconds}&mode=core&profile={profile}&tier={tier}"
        )
        wait_for(sampler, gpu_seconds + 4)
        gpu = gpu_summary(sampler.samples)
        if gpu:
            print(f"      max {gpu['maxTemp']}C, avg load {gpu['avgUtil']}%, peak {gpu['maxPowerW']} W")
        if memory_seconds and not sampler.abort:
            sampler.phase = "memory"
            post(server, f"/api/agent/{code}", {"type": "phase", "phase": "memory"})
            if tier == "bench" and run_memtest(sampler, memory_seconds):
                vram_tool = "memtest_vulkan"
            else:
                vram_tool = "bandwidth"
                print(f"[3b] VRAM bandwidth ({memory_seconds}s, no miner)...")
                webbrowser.open(
                    f"{server.rstrip('/')}/stress?code={code}&seconds={memory_seconds}&mode=memory&profile={profile}&tier={tier}"
                )
                wait_for(sampler, memory_seconds + 4)
    elif load_skipped:
        print("[3/4] GPU stress skipped")
    elif sampler.abort:
        print(f"[3/4] GPU stress skipped: already at {abort_c}C")
    else:
        print("[3/4] No NVIDIA GPU found - skipping GPU stress")
        gpu_seconds = 0
        memory_seconds = 0

    hashrate = {
        "requested": bool(remote.get("hashrate")),
        "ran": False,
        "mhPerS": None,
        "referenceMhS": None,
        "note": "Hashrate check was not requested.",
    }
    if remote.get("hashrate") and tier not in ("standard", "bench"):
        hashrate["note"] = "Hashrate check was not run. It needs Standard or Bench."
    elif remote.get("hashrate") and not identity["gpus"]:
        hashrate["note"] = "Hashrate check was not run. No GPU was found."
    elif remote.get("hashrate") and (sampler.abort or load_skipped):
        hashrate["note"] = "Hashrate check was not run. The load was already stopped."
    elif remote.get("hashrate"):
        print("[3c] Hashrate sample (20s, offline, no pool)...")
        sampler.phase = "hashrate"
        post(server, f"/api/agent/{code}", {"type": "phase", "phase": "hashrate"})
        measured = run_hashrate(sampler, 20)
        if measured is None:
            hashrate["note"] = "Hashrate check was not run. No offline benchmark is installed."
        elif measured["mhPerS"] is None:
            hashrate["note"] = "Hashrate check was not run. The benchmark did not print a rate."
        else:
            hashrate["ran"] = True
            hashrate["mhPerS"] = measured["mhPerS"]
            hashrate["referenceMhS"] = measured["referenceMhS"]
            hashrate["note"] = "Offline hashrate sample. No pool was joined."
            print(f"      {measured['mhPerS']} MH/s")

    blender = None
    if tier in ("standard", "bench") and not load_skipped:
        print("[3d] Blender Open Data junkshop...")
        sampler.phase = "blender"
        post(server, f"/api/agent/{code}", {"type": "phase", "phase": "blender"})
        cpu_run = run_blender_junkshop("CPU", sampler)
        gpu_run = None
        if identity["gpus"] and not sampler.abort:
            gpu_run = run_blender_junkshop("CUDA", sampler)
        elif identity["gpus"] and sampler.abort:
            gpu_run = {
                "scene": BLENDER_SCENE, "api": "CUDA", "blenderVersion": BLENDER_VERSION,
                "sceneId": None, "seconds": None, "ran": False, "aborted": True,
                "note": "Junkshop CUDA was not started. The load was already stopped for heat.",
            }
        blender = {"pinnedVersion": BLENDER_VERSION, "cpu": cpu_run, "gpu": gpu_run}
    elif tier in ("standard", "bench") and load_skipped:
        blender = {
            "pinnedVersion": BLENDER_VERSION,
            "cpu": {
                "scene": BLENDER_SCENE, "api": "CPU", "blenderVersion": BLENDER_VERSION,
                "sceneId": None, "seconds": None, "ran": False, "aborted": False,
                "note": "Blender Benchmark was not run. The laptop was not on AC.",
            },
            "gpu": None,
        }

    sampler.phase = "cooldown"
    time.sleep(2)
    sampler.stopped.set()

    note = load_skipped or "No miner. Burn-in was not run."
    if tier in ("standard", "bench") and blender and not (blender.get("cpu") or {}).get("ran") and not (blender.get("gpu") or {}).get("ran"):
        note = (blender.get("cpu") or {}).get("note") or note

    print("[4/4] Sending results...")
    post(server, f"/api/agent/{code}", {"type": "results", "results": {"cpu": cpu, "gpu": gpu, "checks": {
        "abortedHot": sampler.hot and not load_skipped,
        "abortTempC": abort_c,
        "gpuStressS": 0 if load_skipped else gpu_seconds,
        "memoryStressS": 0 if sampler.abort or load_skipped else memory_seconds,
        "stressTier": tier,
        "onAc": ac,
        "loadSkipped": load_skipped,
        "vramTool": vram_tool,
        "hashrate": hashrate,
        "blender": blender,
        "limits": limits,
        "burnIn": "not run",
        "note": note,
    }}})
    print("\nDone. Finish the review in the Dibs staff panel.")


def cmd_verify(args):
    print(f"Dibs delivery check  ->  {args.server}  (listing {args.listing})\n")
    print("Reading hardware...")
    identity = collect_identity()
    dhash = device_hash(identity)
    res = post(args.server, "/api/verify", {
        "listingId": args.listing, "deviceHash": dhash, "partHashes": part_hashes(identity),
        "fingerprints": fingerprints(identity),
        "summary": {"model": f"{identity['system']['manufacturer']} {identity['system']['model']}",
                    "cpu": identity["cpu"]["name"], "gpus": [g["name"] for g in identity["gpus"]]},
    })
    print()
    if res.get("match"):
        print("  MATCH - this is the exact hardware the store tested. Payment can be released.")
    else:
        print("  MISMATCH - this is NOT the hardware the store tested. Do not release payment; open a dispute.")
    print(f"  fingerprint {dhash}")


def app_dir():
    base = sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__)
    return os.path.dirname(base)


def resolve_server(arg):
    """--server, then DIBS_SERVER, then dibs_server.txt beside the agent, then the built-in default."""
    if arg:
        return arg.rstrip("/")
    env = (os.environ.get("DIBS_SERVER") or "").strip()
    if env:
        return env.rstrip("/")
    try:
        with open(os.path.join(app_dir(), "dibs_server.txt"), encoding="utf-8") as f:
            line = f.readline().strip()
            if line:
                return line.rstrip("/")
    except OSError:
        pass
    return DEFAULT_SERVER.rstrip("/") if DEFAULT_SERVER else ""


def clean_code(raw):
    """Accept the bare code or a pasted link such as https://site/run/ABC123."""
    value = (raw or "").strip().rstrip("/")
    return value.split("/")[-1].split("?")[0].upper()


def ask(prompt):
    try:
        return input(prompt).strip()
    except EOFError:
        return ""


def pause():
    if sys.stdin and sys.stdin.isatty():
        ask("\nPress Enter to close this window.")


def interactive(args):
    print("Dibs test agent\n")
    server = resolve_server(args.server) or ask("Dibs address (for example https://dibs.example.com): ").rstrip("/")
    if not server:
        print("No address given.")
        return None
    entry = ask("Code from the shop, or the listing ID for a delivery check: ")
    if not entry:
        print("Nothing entered.")
        return None
    code = clean_code(entry)
    if len(code) == 6 and code.isalnum():
        return argparse.Namespace(command="test", server=server, code=code, tier=None,
                                  cpu_seconds=None, gpu_seconds=None, memory_seconds=None, func=cmd_test)
    return argparse.Namespace(command="verify", server=server, listing=entry.strip().split("/")[-1], func=cmd_verify)


def main():
    p = argparse.ArgumentParser(description="Dibs test agent")
    p.add_argument("--server", default=None, help="Dibs address. Optional when the agent was built with one")
    sub = p.add_subparsers(dest="command", required=False)

    t = sub.add_parser("test", help="run the store test and upload results")
    t.add_argument("--server", default=None)
    t.add_argument("--code", required=True, help="session code or link from the staff panel")
    t.add_argument("--tier", choices=sorted(TIERS), default=None,
                   help="light, standard, or bench. Omit to use the session, or Light on a laptop and Standard on a desktop")
    t.add_argument("--cpu-seconds", type=int, default=None, help="optional shorter CPU run, cannot exceed the tier")
    t.add_argument("--gpu-seconds", type=int, default=None, help="optional shorter core stress, cannot exceed the tier")
    t.add_argument("--memory-seconds", type=int, default=None, help="optional shorter VRAM pass, cannot exceed the tier; 0 skips it")
    t.set_defaults(func=cmd_test)

    v = sub.add_parser("verify", help="buyer: check a delivered device against its listing")
    v.add_argument("--server", default=None)
    v.add_argument("--listing", required=True)
    v.set_defaults(func=cmd_verify)

    args = p.parse_args()
    walk_up = args.command is None
    if walk_up:
        args = interactive(args)
        if args is None:
            pause()
            sys.exit(1)
    else:
        args.server = resolve_server(args.server)
        if not args.server:
            print("No Dibs address. Pass --server, set DIBS_SERVER, or put it in dibs_server.txt next to the agent.")
            sys.exit(2)
        if args.command == "test":
            args.code = clean_code(args.code)

    failed = False
    try:
        args.func(args)
    except (urllib.error.URLError, urllib.error.HTTPError):
        failed = True
    finally:
        if walk_up or getattr(sys, "frozen", False):
            pause()
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    mp.freeze_support()
    main()
