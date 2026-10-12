import { modelTempBand, resolveGpuTemps } from "@/lib/limits";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kind = url.searchParams.get("kind") === "cpu" ? "cpu" : "gpu";
  const device = url.searchParams.get("device") === "laptop" ? "laptop" : "desktop";
  const slowdown = url.searchParams.get("slowdown");
  const slowdownTempC = slowdown != null && slowdown !== "" ? Number(slowdown) : null;

  if (!q) return Response.json({ error: "pass ?q=GPU or CPU name" }, { status: 400 });

  if (kind === "gpu") {
    const resolved = resolveGpuTemps({
      gpuName: q,
      device,
      slowdownTempC: Number.isFinite(slowdownTempC) ? slowdownTempC : null,
    });
    return Response.json({
      q,
      kind,
      device,
      warnC: resolved.warnC,
      stopC: resolved.stopC,
      source: resolved.source,
      slowdownTempC: resolved.slowdownTempC,
    });
  }

  const band = modelTempBand(q, "cpu", device);
  return Response.json({
    q,
    kind,
    device,
    warnC: band.warnC,
    stopC: band.stopC,
    source: band.source,
  });
}
