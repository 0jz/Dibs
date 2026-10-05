import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";

const root = path.join(process.cwd(), "..", "keypairs");

export function programId(): PublicKey | null {
  const fromEnv = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (fromEnv) {
    try {
      return new PublicKey(fromEnv);
    } catch {
      return null;
    }
  }
  const file = path.join(root, "program-id.txt");
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return null;
  return new PublicKey(text);
}

export function adminKeypair(): Keypair | null {
  const env = process.env.SHOP_KEYPAIR;
  if (env) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env)));
  }
  const file = path.join(root, "devnet-admin.json");
  if (!fs.existsSync(file)) return null;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}
