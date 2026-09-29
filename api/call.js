import { sql, guard } from "./_lib.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    if (!(await guard(req, res))) return;
    if (!process.env.CALL_API_URL) return res.status(500).json({ error: "CALL_API_URL is not set in Vercel" });

    const [l] = await sql`SELECT id, name, phone FROM leads WHERE id = ${req.body?.id ?? ""}`;
    if (!l) return res.status(404).json({ error: "Lead not found" });
    if (!l.phone) return res.status(400).json({ error: "This lead has no phone number" });

    // Adjust this body to match what your calling app expects.
    const r = await fetch(process.env.CALL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CALL_API_KEY ? { Authorization: `Bearer ${process.env.CALL_API_KEY}` } : {}),
      },
      body: JSON.stringify({ to: l.phone, name: l.name, leadId: l.id }),
    });
    if (!r.ok) throw new Error(`Calling app returned ${r.status}`);

    await sql`UPDATE leads SET last_call = ${Date.now()}, status = CASE WHEN status = 'New' THEN 'Called' ELSE status END WHERE id = ${l.id}`;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
