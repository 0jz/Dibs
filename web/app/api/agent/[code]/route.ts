import { readDb, updateDb } from "@/lib/db";
import { TEST_LIMITS } from "@/lib/tests";

// Called by the test agent (and the /stress page) on the machine under test.
// The 6-character session code shown in the staff panel is the only credential.
type Ctx = { params: Promise<{ code: string }> };

const MAX_SAMPLES = 600;

export async function GET(_request: Request, { params }: Ctx) {
  const { code } = await params;
  const session = readDb().sessions.find((s) => s.code === code.toUpperCase());
  if (!session) return Response.json({ error: "Unknown session code" }, { status: 404 });
  return Response.json({ abort: Boolean(session.abort), phase: session.phase });
}

export async function POST(request: Request, { params }: Ctx) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.type) return Response.json({ error: "bad payload" }, { status: 400 });

  const result = updateDb((db) => {
    const session = db.sessions.find((s) => s.code === code.toUpperCase());
    if (!session) return { error: "Unknown session code", status: 404 };
    if (session.status === "published") return { error: "Session already published", status: 409 };

    switch (body.type) {
      case "identity":
        session.identity = body.identity;
        session.deviceHash = body.deviceHash;
        session.partHashes = Array.isArray(body.partHashes) ? body.partHashes.map(String) : [];
        session.status = "testing";
        session.phase = "identity";
        break;
      case "phase":
        session.phase = String(body.phase);
        break;
      case "samples": {
        const incoming = Array.isArray(body.samples) ? body.samples : [];
        session.samples.push(...incoming);
        session.samples = session.samples.slice(-MAX_SAMPLES);
        if (incoming.some((s: { gpuTemp?: number | null }) => (s?.gpuTemp ?? 0) >= TEST_LIMITS.abortTempC)) {
          session.abort = true;
        }
        break;
      }
      case "abort":
        session.abort = true;
        break;
      case "gpuScore": {
        const score = body.gpuScore;
        if (score?.mode === "memory") session.memoryScore = score;
        else session.gpuScore = score;
        break;
      }
      case "results":
        session.results = body.results;
        session.status = "done";
        session.phase = "done";
        break;
      default:
        return { error: "unknown type", status: 400 };
    }
    return { ok: true };
  });

  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
