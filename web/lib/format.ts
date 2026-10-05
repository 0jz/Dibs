import type { Grade, Identity, Listing, ListingKind } from "./types";

export const shortHash = (h: string | null | undefined, n = 6) =>
  h ? `${h.slice(0, 2 + n)}…${h.slice(-n)}` : "—";

export const money = (price: number, currency: Listing["currency"]) =>
  currency === "EUR" ? `€${price.toLocaleString("en-US")}` : `${price.toLocaleString("en-US")} ${currency}`;

export const date = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const GRADE_INFO: Record<Grade, { label: string; tone: string }> = {
  A: { label: "Excellent", tone: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10" },
  B: { label: "Good", tone: "text-amber-200 border-amber-300/40 bg-amber-300/10" },
  C: { label: "Fair", tone: "text-orange-300 border-orange-400/40 bg-orange-400/10" },
};

/** Strip marketing noise from WMI names: "Intel(R) Core(TM) i7-14650HX" -> "Intel Core i7-14650HX". */
export const cleanName = (s: string) => s.replace(/\((R|TM|C)\)/gi, "").replace(/\s+/g, " ").trim();

export function suggestTitle(identity: Identity, kind: ListingKind = "device", gpuIndex = 0) {
  if (kind === "part" && identity.gpus[gpuIndex]) return identity.gpus[gpuIndex].name;
  const gpu = identity.gpus[0]?.name.replace(/^NVIDIA GeForce /, "");
  if (identity.deviceType === "laptop") {
    const model = identity.system.model.split(" ").slice(0, 4).join(" ");
    return [model, gpu].filter(Boolean).join(" · ");
  }
  return gpu ? `${identity.gpus[0].name}` : cleanName(identity.cpu.name);
}

export const tempTone = (t: number | null | undefined) =>
  t == null ? "text-zinc-400" : t >= 87 ? "text-red-400" : t >= 80 ? "text-amber-300" : "text-emerald-300";
