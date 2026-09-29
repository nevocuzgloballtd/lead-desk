import { sql, guard } from "./_lib.js";

const MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.internationalPhoneNumber", "places.websiteUri", "places.googleMapsUri", "places.rating",
  "places.userRatingCount", "places.businessStatus", "nextPageToken",
].join(",");

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    if (!(await guard(req, res))) return;
    if (!process.env.GOOGLE_PLACES_API_KEY) return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not set in Vercel" });

    const { keyword, area } = req.body || {};
    if (!keyword || !area) return res.status(400).json({ error: "Business type and area are required" });
    const pages = Math.min(Math.max(Number(req.body.pages) || 1, 1), 3);

    let token = "", seen = 0, noSite = 0, added = 0;
    for (let p = 0; p < pages; p++) {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask": MASK,
        },
        body: JSON.stringify({ textQuery: `${keyword} in ${area}`, pageSize: 20, ...(token ? { pageToken: token } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Google request failed");

      for (const x of d.places || []) {
        seen++;
        if (x.websiteUri || x.businessStatus === "CLOSED_PERMANENTLY") continue;
        noSite++;
        const rows = await sql`INSERT INTO leads (id, name, phone, address, maps, rating, ratings_count, added)
          VALUES (${x.id}, ${x.displayName?.text || "Unnamed"}, ${x.internationalPhoneNumber || x.nationalPhoneNumber || ""},
          ${x.formattedAddress || ""}, ${x.googleMapsUri || ""}, ${x.rating ?? null}, ${x.userRatingCount ?? null}, ${Date.now()})
          ON CONFLICT (id) DO NOTHING RETURNING id`;
        added += rows.length;
      }
      token = d.nextPageToken;
      if (!token) break;
    }
    res.json({ seen, noSite, added });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
