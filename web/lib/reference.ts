import "server-only";
import fs from "node:fs";
import path from "node:path";
import { deviceKey } from "@/lib/format";

export { deviceKey };

export type RefScene = {
  label: string;
  id: string;
  n: number;
  /** Blender samples per minute. Higher is faster. */
  spm: { p5: number; p10: number; p25: number; median: number; p75: number; p95: number };
  /** Present when the catalog was built with version filtering. */
  blenderVersion?: string;
};

export type RefDevice = {
  kind: "GPU" | "CPU";
  api: string;
  name: string;
  key: string;
  n: number;
  scenes: RefScene[];
};

type Catalog = {
  source: string;
  url: string;
  license: string;
  dump: string;
  builtAt: string;
  rowsRead: number;
  samplesUsed: number;
  minSamples: number;
  devices: RefDevice[];
};

const FILE = path.join(process.cwd(), "reference", "blender.json");
const PHONE_FILE = path.join(process.cwd(), "reference", "phones.json");

let catalog: Catalog | null | undefined;

export function loadCatalog(): Catalog | null {
  if (catalog !== undefined) return catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(FILE, "utf8")) as Catalog;
  } catch {
    catalog = null;
  }
  return catalog;
}

const SCENE_RANK = ["junkshop", "monster", "classroom", "bmw27", "barbershop_interior", "fishy_cat"];

function headline(device: RefDevice) {
  const ranked = [...device.scenes].sort((a, b) => {
    const ra = SCENE_RANK.indexOf(a.label);
    const rb = SCENE_RANK.indexOf(b.label);
    if (ra !== -1 || rb !== -1) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    return b.n - a.n;
  });
  return ranked[0] ?? null;
}

export function lookupPart(query: string, kind?: "GPU" | "CPU") {
  const cat = loadCatalog();
  const key = deviceKey(query);
  if (!cat || !key) {
    return { catalog: cat, key, matches: [] as (RefDevice & { headline: RefScene | null })[] };
  }
  const pool = cat.devices.filter((d) => (kind ? d.kind === kind : true));
  const exact = pool.filter((d) => d.key === key);
  const chosen = exact.length
    ? exact
    : pool.filter((d) => d.key.startsWith(key + " ") || key.startsWith(d.key + " "));
  const matches = chosen
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((d) => ({ ...d, headline: headline(d) }));
  return { catalog: cat, key, matches };
}

export function phoneReference() {
  try {
    return JSON.parse(fs.readFileSync(PHONE_FILE, "utf8"));
  } catch {
    return null;
  }
}
