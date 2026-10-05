"use client";

import { useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative rounded-lg border border-white/10 bg-black/50 font-mono text-xs text-zinc-300">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2.5 pr-16">{command}</pre>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-1.5 top-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-sans text-[11px] text-zinc-300 hover:bg-white/10"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
