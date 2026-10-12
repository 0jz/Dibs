"""Build a compact PC-part reference from the Blender Open Data dump.

Reads opendata-latest.zip (CC0, https://opendata.blender.org/) and writes
web/reference/blender.json: samples-per-minute percentiles per GPU/CPU, scene, API,
and Blender version. Higher is faster. Since Blender 3.0 the benchmark scenes render for
a fixed time limit, so total_render_time is about the same on every card and is not
used. The full dump stays out of git.

Usage:
  python scripts/build_blender_reference.py "C:\\Users\\Nikola\\Downloads\\opendata-latest.zip"
"""

import json
import random
import re
import statistics
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "reference" / "blender.json"
# Match the version Dibs pins in the agent / lib/performance.ts.
PINNED_VERSION = "4.5.0"
PINNED_MM = ".".join(PINNED_VERSION.split(".")[:2])
MIN_N = 15
MAX_KEEP = 400
MAX_SCENES = 8

DROP = re.compile(r"\b(NVIDIA|GEFORCE|AMD|RADEON|INTEL|ARC|CORPORATION|INC)\b", re.I)


def device_key(name: str) -> str:
    s = name.upper().replace("(R)", " ").replace("(TM)", " ").replace("(C)", " ")
    s = DROP.sub(" ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * p)))
    return ordered[idx]


def samples_per_minute(stats: dict) -> float | None:
    """The speed metric opendata.blender.org ranks by. Falls back to samples / time."""
    value = stats.get("samples_per_minute")
    if not isinstance(value, (int, float)) or value <= 0:
        samples, took = stats.get("number_of_samples"), stats.get("time_for_samples")
        if not isinstance(samples, (int, float)) or not isinstance(took, (int, float)) or took <= 0:
            return None
        value = samples / took * 60
    return float(value) if 0 < value < 1_000_000 else None


def blender_version(item: dict, info: dict) -> str:
    for bag in (item, info, item.get("system_info") or {}):
        if not isinstance(bag, dict):
            continue
        for field in ("blender_version", "blenderVersion", "version"):
            raw = bag.get(field)
            if isinstance(raw, str) and re.match(r"^\d+\.\d+", raw):
                return raw.strip()
            if isinstance(raw, dict):
                ver = raw.get("version") or raw.get("string")
                if isinstance(ver, str) and re.match(r"^\d+\.\d+", ver):
                    return ver.strip()
    return ""


def version_bucket(ver: str) -> str:
    """Collapse 4.5.x onto the pinned patch so the shop score matches one catalog row."""
    if not ver:
        return ""
    if ver.startswith(PINNED_MM):
        return PINNED_VERSION
    return ver


def main() -> None:
    zip_path = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "Downloads" / "opendata-latest.zip")
    if not zip_path.exists():
        sys.exit(f"dump not found: {zip_path}")

    counts: dict[tuple, int] = defaultdict(int)
    samples: dict[tuple, list[float]] = defaultdict(list)
    names: dict[tuple, str] = {}
    lines = 0
    used = 0

    with zipfile.ZipFile(zip_path) as zf:
        jsonl = next(n for n in zf.namelist() if n.endswith(".jsonl"))
        dump_name = Path(jsonl).stem
        with zf.open(jsonl) as raw:
            for line in raw:
                lines += 1
                if lines % 250_000 == 0:
                    print(f"  {lines:,} rows, {len(counts):,} keys", flush=True)
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                data = obj.get("data")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    info = item.get("device_info") or {}
                    if not isinstance(info, dict):
                        continue
                    api = str(info.get("device_type") or "").upper()
                    if api not in {"CPU", "CUDA", "OPTIX", "HIP", "ONEAPI", "METAL", "OPENCL"}:
                        continue
                    stats = item.get("stats") or {}
                    spm = samples_per_minute(stats)
                    if spm is None:
                        continue
                    scene = item.get("scene") or {}
                    label = str(scene.get("label") or "")
                    checksum = str(scene.get("checksum") or "")
                    if not label or not checksum:
                        continue
                    ver_key = version_bucket(blender_version(item, info))
                    picked = None
                    for device in info.get("compute_devices") or []:
                        if not isinstance(device, dict) or not device.get("name"):
                            continue
                        if api != "CPU" and str(device.get("type") or "").upper() == "CPU":
                            continue
                        picked = str(device["name"]).strip()
                        break
                    if not picked:
                        continue
                    dkey = device_key(picked)
                    if not dkey:
                        continue
                    key = ("CPU" if api == "CPU" else "GPU", api, dkey, label, checksum[:24], ver_key)
                    names[key] = picked
                    n = counts[key] + 1
                    counts[key] = n
                    bucket = samples[key]
                    if len(bucket) < MAX_KEEP:
                        bucket.append(spm)
                    else:
                        j = random.randrange(n)
                        if j < MAX_KEEP:
                            bucket[j] = spm
                    used += 1

    grouped: dict[tuple, dict] = {}
    for key, n in counts.items():
        if n < MIN_N:
            continue
        kind, api, dkey, label, checksum, ver_key = key
        bucket = samples[key]
        gid = (kind, api, dkey)
        device = grouped.setdefault(
            gid,
            {
                "kind": kind,
                "api": api,
                "name": names[key],
                "key": dkey,
                "n": 0,
                "scenes": [],
            },
        )
        device["n"] += n
        scene_row = {
            "label": label,
            "id": checksum,
            "n": n,
            "spm": {
                "p5": round(percentile(bucket, 0.05), 1),
                "p10": round(percentile(bucket, 0.10), 1),
                "p25": round(percentile(bucket, 0.25), 1),
                "median": round(statistics.median(bucket), 1),
                "p75": round(percentile(bucket, 0.75), 1),
                "p95": round(percentile(bucket, 0.95), 1),
            },
        }
        if ver_key:
            scene_row["blenderVersion"] = ver_key
        device["scenes"].append(scene_row)

    devices = []
    for device in grouped.values():

        def scene_rank(s: dict) -> tuple:
            pinned = 0 if s.get("blenderVersion") == PINNED_VERSION else 1
            junk = 0 if str(s.get("label", "")).lower() == "junkshop" else 1
            return (junk, pinned, -s["n"])

        device["scenes"].sort(key=scene_rank)
        device["scenes"] = device["scenes"][:MAX_SCENES]
        devices.append(device)
    devices.sort(key=lambda d: d["n"], reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "Blender Open Data",
        "url": "https://opendata.blender.org/",
        "license": "CC0",
        "dump": dump_name,
        "metric": "samples_per_minute",
        "pinnedBlenderVersion": PINNED_VERSION,
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rowsRead": lines,
        "samplesUsed": used,
        "minSamples": MIN_N,
        "devices": devices,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}  devices={len(devices)}  bytes={OUT.stat().st_size:,}  rows={lines:,}")


if __name__ == "__main__":
    main()
