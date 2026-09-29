import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

let client;
export const sql = (...args) => (client ??= neon(process.env.DATABASE_URL))(...args);

let ready;
export const init = () =>
  (ready ??= sql`CREATE TABLE IF NOT EXISTS leads (
    id text PRIMARY KEY,
    name text NOT NULL,
    phone text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    maps text NOT NULL DEFAULT '',
    rating real,
    ratings_count int,
    status text NOT NULL DEFAULT 'New',
    notes text NOT NULL DEFAULT '',
    follow_at bigint,
    follow_note text,
    notified boolean NOT NULL DEFAULT false,
    last_call bigint,
    added bigint NOT NULL
  )`);

const sign = (v) => crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(v).digest("hex");
const DAYS = 30;

export function makeCookie() {
  const exp = String(Date.now() + DAYS * 864e5);
  return `ld_session=${exp}.${sign(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DAYS * 86400}`;
}
export const clearCookie = "ld_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";

function authed(req) {
  if (!process.env.SESSION_SECRET) return false;
  const m = /(?:^|; )ld_session=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

export async function guard(req, res) {
  if (!authed(req)) {
    res.status(401).json({ error: "Sign in required" });
    return false;
  }
  await init();
  return true;
}
