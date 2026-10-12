import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import type { DB } from "./types";

// Two backends behind one API.
//
// Hosted (Vercel): Upstash Redis over its REST API, used when KV_REST_API_URL and
// KV_REST_API_TOKEN (Vercel Marketplace) or UPSTASH_REDIS_REST_URL / _TOKEN are set.
// The whole DB is one key holding "<version>:<gzip+base64>". A write is a Lua
// compare-and-set on that version, retried when another request got in first, so two
// instances cannot overwrite each other's changes. Version and data share one key so
// a single GET always returns a matching pair.
//
// Local: one JSON file under data/. The read-modify-write is synchronous, so it
// cannot interleave on Node's single thread.
const FILE = path.join(process.cwd(), "data", "db.json");
const KEY = "dibs:db";
const MAX_ATTEMPTS = 12;

const empty = (): DB => ({ sessions: [], listings: [], verifications: [] });

function remote() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function command<T>(conn: { url: string; token: string }, args: (string | number)[]): Promise<T> {
  const res = await fetch(conn.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${args[0]} failed: ${body.error ?? res.status}`);
  return body.result as T;
}

const pack = (db: DB) => zlib.gzipSync(JSON.stringify(db)).toString("base64");
const unpack = (raw: string): DB => ({ ...empty(), ...JSON.parse(zlib.gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) });

async function readRemote(conn: { url: string; token: string }) {
  const raw = await command<string | null>(conn, ["GET", KEY]);
  const split = raw ? raw.indexOf(":") : -1;
  if (!raw || split < 1) return { db: empty(), version: "0" };
  return { db: unpack(raw.slice(split + 1)), version: raw.slice(0, split) };
}

// Replace the document only if its version is still the one we read, and bump it.
const CAS = `local cur = redis.call('GET', KEYS[1])
local ver = '0'
if cur then ver = string.match(cur, '^(%d+):') or '0' end
if ver == ARGV[1] then
  redis.call('SET', KEYS[1], tostring(tonumber(ver) + 1) .. ':' .. ARGV[2])
  return 1
end
return 0`;

function readFile(): DB {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return empty();
  }
}

export async function readDb(): Promise<DB> {
  const conn = remote();
  if (!conn) return readFile();
  return (await readRemote(conn)).db;
}

/**
 * Read, change, write. `fn` may run more than once when another request wrote
 * first, so keep it free of side effects other than changing `db` and returning.
 */
export async function updateDb<T>(fn: (db: DB) => T): Promise<T> {
  const conn = remote();
  if (!conn) {
    const db = readFile();
    const result = fn(db);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(db, null, 2));
    fs.renameSync(FILE + ".tmp", FILE);
    return result;
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { db, version } = await readRemote(conn);
    const result = fn(db);
    const won = await command<number>(conn, ["EVAL", CAS, 1, KEY, version, pack(db)]);
    if (won === 1) return result;
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("Could not save: the database was busy. Try again.");
}

export const newId = () => crypto.randomBytes(6).toString("hex");

// No 0/O/1/I so codes are easy to read off a screen.
export function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
}

export function sha256(value: unknown) {
  return "0x" + crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const STORE_NAME = process.env.DIBS_STORE_NAME ?? "Dibs Demo Shop · Belgrade";
