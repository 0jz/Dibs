import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DB } from "./types";

// Hackathon storage: one JSON file. Reads and writes are synchronous, so each
// request's read-modify-write runs without interleaving on Node's single thread.
const FILE = path.join(process.cwd(), "data", "db.json");

const empty = (): DB => ({ sessions: [], listings: [], verifications: [] });

export function readDb(): DB {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return empty();
  }
}

export function updateDb<T>(fn: (db: DB) => T): T {
  const db = readDb();
  const result = fn(db);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(db, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
  return result;
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
