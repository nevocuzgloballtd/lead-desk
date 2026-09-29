import { sql, guard } from "./_lib.js";

export default async function handler(req, res) {
  try {
    if (!(await guard(req, res))) return;

    if (req.method === "GET") {
      const leads = await sql`SELECT id, name, phone, address, maps, rating, ratings_count AS count, status, notes,
        follow_at::float8 AS "followAt", follow_note AS "followNote", notified,
        last_call::float8 AS "lastCall", added::float8 AS added
        FROM leads ORDER BY added DESC`;
      return res.json({ leads });
    }

    if (req.method === "PUT") {
      const l = req.body || {};
      if (!l.id) return res.status(400).json({ error: "Missing id" });
      await sql`INSERT INTO leads (id, name, phone, address, maps, rating, ratings_count, status, notes, follow_at, follow_note, notified, last_call, added)
        VALUES (${l.id}, ${l.name ?? ""}, ${l.phone ?? ""}, ${l.address ?? ""}, ${l.maps ?? ""}, ${l.rating ?? null}, ${l.count ?? null},
        ${l.status ?? "New"}, ${l.notes ?? ""}, ${l.followAt ?? null}, ${l.followNote ?? null}, ${!!l.notified}, ${l.lastCall ?? null}, ${l.added ?? Date.now()})
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, follow_at = EXCLUDED.follow_at,
        follow_note = EXCLUDED.follow_note, notified = EXCLUDED.notified, last_call = EXCLUDED.last_call`;
      return res.json({ ok: true });
    }

    if (req.method === "DELETE") {
      await sql`DELETE FROM leads WHERE id = ${req.query.id}`;
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
