import { lookupPart, phoneReference } from "@/lib/reference";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  if (kindParam === "phone") {
    const phones = phoneReference();
    if (!phones) return Response.json({ error: "phone reference missing" }, { status: 404 });
    return Response.json(phones);
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ error: "pass ?q=GPU or CPU name, or ?kind=phone" }, { status: 400 });
  const kind = kindParam === "cpu" ? "CPU" : kindParam === "gpu" ? "GPU" : undefined;
  const { catalog, key, matches } = lookupPart(q, kind);
  if (!catalog) {
    return Response.json(
      { error: "Blender Open Data catalog is not built yet", hint: "python scripts/build_blender_reference.py" },
      { status: 503 },
    );
  }
  return Response.json({
    source: catalog.source,
    url: catalog.url,
    license: catalog.license,
    dump: catalog.dump,
    builtAt: catalog.builtAt,
    query: q,
    key,
    matches: matches.map((d) => ({
      kind: d.kind,
      api: d.api,
      name: d.name,
      samples: d.n,
      headline: d.headline,
      scenes: d.scenes,
    })),
  });
}
