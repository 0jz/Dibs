import type { Sample } from "@/lib/types";

const W = 640;
const H = 180;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

const PHASE_FILL: Record<string, string> = {
  cpu: "rgba(96,165,250,0.08)",
  gpu: "rgba(245,165,36,0.10)",
};

/** GPU temperature (°C) and load (%) over the test, with CPU/GPU phases shaded. */
export function TelemetryChart({ samples }: { samples: Sample[] }) {
  if (samples.length < 2) {
    return (
      <div className="grid h-[180px] place-items-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-500">
        Waiting for telemetry…
      </div>
    );
  }

  const t0 = samples[0].t;
  const span = Math.max(samples[samples.length - 1].t - t0, 1);
  const x = (t: number) => PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.min(v, 100) / 100) * (H - PAD.t - PAD.b);

  const line = (key: "gpuTemp" | "gpuUtil") =>
    samples
      .filter((s) => s[key] != null)
      .map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(s[key] as number).toFixed(1)}`)
      .join(" ");

  // Contiguous runs of the same phase become shaded bands.
  const bands: { phase: string; from: number; to: number }[] = [];
  for (const s of samples) {
    const last = bands[bands.length - 1];
    if (last && last.phase === s.phase) last.to = s.t;
    else bands.push({ phase: s.phase, from: s.t, to: s.t });
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GPU temperature and load over time">
        {bands.map((b, i) =>
          PHASE_FILL[b.phase] ? (
            <g key={i}>
              <rect x={x(b.from)} y={PAD.t} width={Math.max(x(b.to) - x(b.from), 1)} height={H - PAD.t - PAD.b} fill={PHASE_FILL[b.phase]} />
              <text x={x(b.from) + 4} y={PAD.t + 11} className="fill-zinc-500 text-[10px] uppercase tracking-wider">
                {b.phase} test
              </text>
            </g>
          ) : null,
        )}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" className="fill-zinc-500 text-[10px]">
              {v}
            </text>
          </g>
        ))}
        <path d={line("gpuUtil")} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeOpacity={0.7} />
        <path d={line("gpuTemp")} fill="none" stroke="#f5a524" strokeWidth={2.2} />
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[10px]">
          {Math.round(span)}s
        </text>
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-[#f5a524]" /> GPU temp °C</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-[#60a5fa]" /> GPU load %</span>
      </div>
    </div>
  );
}
