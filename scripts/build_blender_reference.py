"""Build a compact PC-part reference from the Blender Open Data dump.

Reads opendata-latest.zip (CC0, https://opendata.blender.org/) and writes
web/reference/blender.json: median render times per GPU/CPU, scene, and API.
The full dump is about 1.8 GB and stays out of git. Scores are measured
community results, not invented stand-ins.

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
                    api = str(info.get("device_type") or "").upper()
                    if api not in {"CPU", "CUDA", "OPTIX", "HIP", "ONEAPI", "METAL", "OPENCL"}:
                        continue
                    stats = item.get("stats") or {}
                    render = stats.get("total_render_time")
                    if not isinstance(render, (int, float)) or not (0.3 < render < 20000):
                        continue
                    scene = item.get("scene") or {}
                    label = str(scene.get("label") or "")
                    checksum = str(scene.get("checksum") or "")[:12]
                    if not label or not checksum:
                        continue
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
                    key = ( "CPU" if api == "CPU" else "GPU", api, device_key(picked), label, checksum)
                    if not key[2]:
                        continue
                    names[key] = picked
                    n = counts[key] + 1
                    counts[key] = n
                    bucket = samples[key]
                    if len(bucket) < MAX_KEEP:
                        bucket.append(float(render))
                    else:
                        j = random.randrange(n)
                        if j < MAX_KEEP:
                            bucket[j] = float(render)
                    used += 1

    grouped: dict[tuple, dict] = {}
    for key, n in counts.items():
        if n < MIN_N:
            continue
        kind, api, dkey, label, checksum = key
        bucket = samples[key]
        gid = (kind, api, dkey)
        device = grouped.setdefault(gid, {
            "kind": kind,
            "api": api,
            "name": names[key],
            "key": dkey,
            "n": 0,
            "scenes": [],
        })
        device["n"] += n
        # Prefer the most common raw name (first seen is fine; keys already collapsed).
        device["scenes"].append({
            "label": label,
            "id": checksum,
            "n": n,
            "medianS": round(statistics.median(bucket), 2),
            "p25": round(percentile(bucket, 0.25), 2),
            "p75": round(percentile(bucket, 0.75), 2),
        })

    devices = []
    for device in grouped.values():
        device["scenes"].sort(key=lambda s: s["n"], reverse=True)
        device["scenes"] = device["scenes"][:MAX_SCENES]
        devices.append(device)
    devices.sort(key=lambda d: d["n"], reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "Blender Open Data",
        "url": "https://opendata.blender.org/",
        "license": "CC0",
        "dump": dump_name,
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
