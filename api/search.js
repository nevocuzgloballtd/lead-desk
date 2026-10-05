import { sql, guard } from "./_lib.js";
 
// ---------------------------------------------------------------------------
// Search providers. Each one takes { keyword, area, pages, phoneOnly } and
// returns { seen, leads } where leads are businesses WITHOUT a website, shaped
// as { id, name, phone, address, maps, rating, count }.
// To add a new source later, write one more function and add it to PROVIDERS.
// ---------------------------------------------------------------------------
 
const UA = `lead-desk/1.0 (${process.env.OSM_CONTACT || "contact not set"})`;
 
const CATEGORIES = {
  hair: ['"shop"="hairdresser"'],
  beauty: ['"shop"="beauty"'],
  restaurant: ['"amenity"="restaurant"'],
  cafe: ['"amenity"="cafe"'],
  bakery: ['"shop"="bakery"'],
  auto: ['"shop"="car_repair"'],
  plumber: ['"craft"="plumber"'],
  electrician: ['"craft"="electrician"'],
  hvac: ['"craft"="hvac"'],
  roofing: ['"craft"="roofer"'],
  landscaping: ['"craft"="gardener"'],
  laundry: ['"shop"="laundry"', '"shop"="dry_cleaning"'],
  gym: ['"leisure"="fitness_centre"'],
  dentist: ['"amenity"="dentist"'],
  florist: ['"shop"="florist"'],
};
 
async function searchOsm({ keyword, area, phoneOnly }) {
  const filters = CATEGORIES[keyword];
  if (!filters) throw new Error("Pick a business type from the list");
 
  const country = process.env.OSM_COUNTRY ?? "us";
  const geo = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1${country ? `&countrycodes=${country}` : ""}&q=${encodeURIComponent(area)}`,
    { headers: { "User-Agent": UA } }
  );
  if (!geo.ok) throw new Error(`Location lookup failed (${geo.status})`);
  const place = (await geo.json())[0];
  if (!place) throw new Error(`Couldn't find "${area}". Try the format "City, State".`);
  const [s, n, w, e] = place.boundingbox;
 
  const query = `[out:json][timeout:25];(${filters.map((f) => `nwr[${f}](${s},${w},${n},${e});`).join("")});out tags center 200;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!r.ok) throw new Error(`OpenStreetMap server is busy (${r.status}). Try again in a minute or use a smaller area.`);
  const d = await r.json();
 
  const leads = [];
  for (const el of d.elements || []) {
    const t = el.tags || {};
    if (!t.name) continue;
    if (t.website || t["contact:website"] || t.url || t["contact:url"]) continue;
    const phone = t.phone || t["contact:phone"] || "";
    if (phoneOnly && !phone) continue;
    const address = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"], t["addr:state"]]
      .filter(Boolean).join(", ");
    leads.push({
      id: `osm:${el.type}/${el.id}`, name: t.name, phone, address: address || area,
      maps: `https://www.openstreetmap.org/${el.type}/${el.id}`, rating: null, count: null,
    });
  }
  return { seen: (d.elements || []).length, leads };
}
 
const GOOGLE_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.internationalPhoneNumber", "places.websiteUri", "places.googleMapsUri", "places.rating",
  "places.userRatingCount", "places.businessStatus", "nextPageToken",
].join(",");
 
async function searchGoogle({ keyword, area, pages }) {
  if (!process.env.GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set in Vercel");
  let token = "", seen = 0;
  const leads = [];
  for (let p = 0; p < pages; p++) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": GOOGLE_MASK },
      body: JSON.stringify({ textQuery: `${keyword} in ${area}`, pageSize: 20, ...(token ? { pageToken: token } : {}) }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || "Google request failed");
    for (const x of d.places || []) {
      seen++;
      if (x.websiteUri || x.businessStatus === "CLOSED_PERMANENTLY") continue;
      leads.push({
        id: x.id, name: x.displayName?.text || "Unnamed", phone: x.internationalPhoneNumber || x.nationalPhoneNumber || "",
        address: x.formattedAddress || "", maps: x.googleMapsUri || "", rating: x.rating ?? null, count: x.userRatingCount ?? null,
      });
    }
    token = d.nextPageToken;
    if (!token) break;
  }
  return { seen, leads };
}
 
const PROVIDERS = { osm: searchOsm, google: searchGoogle };
 
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    if (!(await guard(req, res))) return;
 
    const b = req.body || {};
    const run = PROVIDERS[b.provider || process.env.SEARCH_PROVIDER || "osm"];
    if (!run) return res.status(400).json({ error: "Unknown search source" });
    if (!b.keyword || !b.area) return res.status(400).json({ error: "Business type and area are required" });
 
    const { seen, leads } = await run({
      keyword: b.keyword, area: b.area,
      pages: Math.min(Math.max(Number(b.pages) || 1, 1), 3),
      phoneOnly: b.phoneOnly !== false,
    });
 
    let added = 0;
    for (const l of leads) {
      const rows = await sql`INSERT INTO leads (id, name, phone, address, maps, rating, ratings_count, added)
        VALUES (${l.id}, ${l.name}, ${l.phone}, ${l.address}, ${l.maps}, ${l.rating}, ${l.count}, ${Date.now()})
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      added += rows.length;
    }
    res.json({ seen, noSite: leads.length, added });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
 
