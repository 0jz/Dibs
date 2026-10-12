"use client";

import { useEffect, useState } from "react";

type Scene = { label: string; n: number; spm: { p5: number; p10: number; p25: number; median: number; p75: number; p95: number } };
type Match = { kind: string; api: string; name: string; samples: number; headline: Scene | null; scenes?: Scene[] };

export function ReferenceMatch({ name, kind = "gpu" }: { name: string; kind?: "gpu" | "cpu" }) {
  const [match, setMatch] = useState<Match | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!name) return;
    const q = new URLSearchParams({ q: name, kind });
    fetch(`/api/reference?${q}`)
      .then(async (res) => {
        if (!res.ok) {
          setMissing(true);
          return;
        }
        const body = await res.json();
        setMatch(body.matches?.[0] ?? null);
        setMissing(!body.matches?.length);
      })
      .catch(() => setMissing(true));
  }, [name, kind]);

  if (!name || missing || !match?.headline) return null;
  const scenes = [...(match.scenes ?? [match.headline])].sort((a, b) => b.n - a.n).slice(0, 3);
  const fastest = Math.max(...scenes.map((scene) => scene.spm.p95), 1);
  return (
    <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Blender Open Data · {match.api}</div>
      <p className="mt-1 text-sm text-zinc-400">
        Community speed for this model, {match.samples.toLocaleString("en-US")} runs, in Blender samples per minute. Higher is faster. The bar is the median. The pale mark is the p25–p75 spread. The shop run on this report is scored against the same numbers.
      </p>
      <div className="mt-4 space-y-3">
        {scenes.map((scene) => (
          <div key={scene.label}>
            <div className="mb-1 flex justify-between text-xs text-zinc-400">
              <span>{scene.label}</span>
              <span className="tabular-nums text-zinc-200">{Math.round(scene.spm.median).toLocaleString("en-US")}/min <span className="text-zinc-500">· n={scene.n}</span></span>
            </div>
            <div className="relative h-2 rounded-full bg-white/5">
              <div className="absolute inset-y-0 rounded-full bg-white/10" style={{ left: `${(scene.spm.p25 / fastest) * 100}%`, width: `${Math.max(((scene.spm.p75 - scene.spm.p25) / fastest) * 100, 1)}%` }} />
              <div className="absolute inset-y-0 rounded-full bg-amber-300" style={{ width: `${(scene.spm.median / fastest) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
