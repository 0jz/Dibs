"use client";

import { useEffect, useState } from "react";

type Headline = { label: string; n: number; medianS: number; p25: number; p75: number };
type Match = { kind: string; api: string; name: string; samples: number; headline: Headline | null };

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
  const h = match.headline;
  return (
    <p className="mt-3 text-sm text-zinc-400">
      Blender Open Data ({match.api}, {match.samples.toLocaleString("en-US")} runs): median{" "}
      <span className="text-zinc-200">{h.medianS}s</span> on {h.label}
      <span className="text-zinc-500"> · p25 {h.p25}s · p75 {h.p75}s · CC0 community results, not a shop score</span>
    </p>
  );
}
