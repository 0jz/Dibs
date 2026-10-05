#!/usr/bin/env python3
"""Dibs test agent.

Runs on the machine being tested (Windows, Python 3.9+, standard library only).

  Store test:   python dibs_agent.py test   --server http://192.168.1.10:3000 --code ABC123
  Buyer check:  python dibs_agent.py verify --server http://192.168.1.10:3000 --listing <listing-id>
"""

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
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


ABORT_C = 90
GPU_STRESS_MAX_S = 90
MEMORY_MAX_S = 30
SAMPLE_FIELDS = ["temperature.gpu", "utilization.gpu", "power.draw", "clocks.gr",
                 "clocks_event_reasons.hw_thermal_slowdown", "clocks_event_reasons.sw_thermal_slowdown"]


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
        return {"designMwh": int(design), "fullMwh": int(full),
                "healthPct": round(min(full / design, 1.0) * 100, 1),
                "cycles": int(num(field("CycleCount")) or 0)}
    except Exception:
        return None
    finally:
        if os.path.exists(path):
            os.remove(path)


def collect_identity():
    system = (ps_json("Get-CimInstance Win32_ComputerSystem | Select Manufacturer,Model,PCSystemType") or [{}])[0]
    bios = (ps_json("Get-CimInstance Win32_BIOS | Select SerialNumber") or [{}])[0]
    cpu = (ps_json("Get-CimInstance Win32_Processor | Select Name,NumberOfCores,NumberOfLogicalProcessors") or [{}])[0]
    ram = ps_json("Get-CimInstance Win32_PhysicalMemory | Select Capacity,Speed,Manufacturer,PartNumber")
    disks = ps_json("Get-PhysicalDisk | Select FriendlyName,MediaType,HealthStatus,Size")
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
                "threads": cpu.get("NumberOfLogicalProcessors")},
        "ram": {"totalGb": round(sum(int(m.get("Capacity") or 0) for m in ram) / 2**30),
                "modules": [{"capacityGb": round(int(m.get("Capacity") or 0) / 2**30), "speedMts": m.get("Speed"),
                             "manufacturer": (m.get("Manufacturer") or "").strip(),
                             "part": (m.get("PartNumber") or "").strip()} for m in ram]},
        "gpus": gpus,
        "disks": [{"model": (d.get("FriendlyName") or "").strip(), "type": d.get("MediaType"),
                   "health": d.get("HealthStatus"), "sizeGb": round(int(d.get("Size") or 0) / 1e9)} for d in disks],
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
    def __init__(self, server, code):
        super().__init__(daemon=True)
        self.server, self.code = server, code
        self.phase = "idle"
        self.samples = []
        self.abort = False
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
                if s["gpuTemp"] is not None and s["gpuTemp"] >= ABORT_C:
                    self.abort = True
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
    """Sleep in one-second steps so a hot GPU stops the load early."""
    end = time.time() + seconds
    while time.time() < end:
        if sampler.abort:
            print(f"      stopped: GPU reached {ABORT_C}C")
            return True
        time.sleep(1)
    return sampler.abort


def cmd_test(args):
    server, code = args.server, args.code.upper()
    print(f"Dibs test agent  ->  {server}  (session {code})\n")

    print("[1/4] Reading hardware...")
    identity = collect_identity()
    dhash = device_hash(identity)
    post(server, f"/api/agent/{code}", {"type": "identity", "identity": identity, "deviceHash": dhash,
                                        "partHashes": part_hashes(identity)})
    print(f"      {identity['system']['manufacturer']} {identity['system']['model']}")
    print(f"      CPU {identity['cpu']['name']}")
    for g in identity["gpus"]:
        print(f"      GPU {g['name']} ({g['vramMb']} MB)")
    print(f"      fingerprint {dhash[:18]}...")

    sampler = Sampler(server, code)
    sampler.start()

    gpu_seconds = min(max(5, args.gpu_seconds), GPU_STRESS_MAX_S)
    memory_seconds = 0 if args.memory_seconds < 0 else min(args.memory_seconds, MEMORY_MAX_S)

    print(f"[2/4] CPU benchmark ({args.cpu_seconds}s)...")
    sampler.phase = "cpu"
    post(server, f"/api/agent/{code}", {"type": "phase", "phase": "cpu"})
    cpu = cpu_benchmark(single_s=max(3, args.cpu_seconds // 3), multi_s=args.cpu_seconds)
    print(f"      single {cpu['singleScore']}  /  multi {cpu['multiScore']}")

    gpu = None
    if identity["gpus"]:
        print(f"[3/4] GPU stress ({gpu_seconds}s, stops at {ABORT_C}C) - a browser window opens, keep it in front...")
        sampler.phase = "gpu"
        post(server, f"/api/agent/{code}", {"type": "phase", "phase": "gpu"})
        webbrowser.open(f"{server.rstrip('/')}/stress?code={code}&seconds={gpu_seconds}&mode=core&profile=pc")
        wait_for(sampler, gpu_seconds + 4)
        gpu = gpu_summary(sampler.samples)
        if gpu:
            print(f"      max {gpu['maxTemp']}C, avg load {gpu['avgUtil']}%, peak {gpu['maxPowerW']} W")
        if memory_seconds and not sampler.abort:
            print(f"[3b] VRAM bandwidth ({memory_seconds}s, no miner)...")
            sampler.phase = "memory"
            post(server, f"/api/agent/{code}", {"type": "phase", "phase": "memory"})
            webbrowser.open(f"{server.rstrip('/')}/stress?code={code}&seconds={memory_seconds}&mode=memory&profile=pc")
            wait_for(sampler, memory_seconds + 4)
    else:
        print("[3/4] No NVIDIA GPU found - skipping GPU stress")

    sampler.phase = "cooldown"
    time.sleep(2)
    sampler.stopped.set()

    print("[4/4] Sending results...")
    post(server, f"/api/agent/{code}", {"type": "results", "results": {"cpu": cpu, "gpu": gpu, "checks": {
        "abortedHot": sampler.abort,
        "abortTempC": ABORT_C,
        "gpuStressS": gpu_seconds,
        "memoryStressS": 0 if sampler.abort else memory_seconds,
        "note": "No miner. Memory wear is the short VRAM-bandwidth pass plus a memtest_vulkan run when that binary is installed.",
    }}})
    print("\nDone. Finish the review in the Dibs staff panel.")


def cmd_verify(args):
    print(f"Dibs delivery check  ->  {args.server}  (listing {args.listing})\n")
    print("Reading hardware...")
    identity = collect_identity()
    dhash = device_hash(identity)
    res = post(args.server, "/api/verify", {
        "listingId": args.listing, "deviceHash": dhash, "partHashes": part_hashes(identity),
        "summary": {"model": f"{identity['system']['manufacturer']} {identity['system']['model']}",
                    "cpu": identity["cpu"]["name"], "gpus": [g["name"] for g in identity["gpus"]]},
    })
    print()
    if res.get("match"):
        print("  MATCH - this is the exact hardware the store tested. Payment can be released.")
    else:
        print("  MISMATCH - this is NOT the hardware the store tested. Do not release payment; open a dispute.")
    print(f"  fingerprint {dhash}")


def main():
    p = argparse.ArgumentParser(description="Dibs test agent")
    sub = p.add_subparsers(dest="command", required=True)

    t = sub.add_parser("test", help="run the store test and upload results")
    t.add_argument("--server", required=True)
    t.add_argument("--code", required=True, help="session code from the staff panel")
    t.add_argument("--cpu-seconds", type=int, default=15)
    t.add_argument("--gpu-seconds", type=int, default=45, help="core stress, capped at 90s")
    t.add_argument("--memory-seconds", type=int, default=20, help="VRAM bandwidth pass, capped at 30s; 0 skips it")
    t.set_defaults(func=cmd_test)

    v = sub.add_parser("verify", help="buyer: check a delivered device against its listing")
    v.add_argument("--server", required=True)
    v.add_argument("--listing", required=True)
    v.set_defaults(func=cmd_verify)

    args = p.parse_args()
    try:
        args.func(args)
    except (urllib.error.URLError, urllib.error.HTTPError):
        sys.exit(1)


if __name__ == "__main__":
    mp.freeze_support()
    main()
