import crypto from "node:crypto";
import { makeCookie, clearCookie } from "./_lib.js";

export default function handler(req, res) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearCookie);
    return res.json({ ok: true });
  }
  if (req.method !== "POST") return res.status(405).end();
  const a = Buffer.from(String(req.body?.password ?? ""));
  const b = Buffer.from(process.env.APP_PASSWORD || "");
  const ok = b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "Wrong password" });
  res.setHeader("Set-Cookie", makeCookie());
  res.json({ ok: true });
}
