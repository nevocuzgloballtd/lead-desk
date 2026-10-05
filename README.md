# Lead desk
 
CRM for finding businesses without a website on Google Maps, tracking follow-ups, and calling them through your calling app.
 
Stack: static page in `public/`, Vercel serverless functions in `api/`, Neon Postgres. Tables are created automatically on first use.
 
## Deploy
1. Push this folder to a new GitHub repo.
2. Import the repo at https://vercel.com/new (no build settings needed).
3. In the Vercel project: Storage > add Neon. This sets `DATABASE_URL`.
4. Settings > Environment Variables: add everything in `.env.example`.
5. Redeploy.
## Environment variables
- `DATABASE_URL`: Neon connection string
- `GOOGLE_PLACES_API_KEY`: Google Cloud, Places API (New) enabled
- `CALL_API_URL` / `CALL_API_KEY`: your calling app's call endpoint and token (body is set in `api/call.js`)
- `APP_PASSWORD`: the password you sign in with
- `SESSION_SECRET`: long random text used to sign the login cookie
## Notes
- Reminders fire while the app is open in a browser tab.
- Each search runs up to 3 pages of 20 results; use fewer pages if a search times out.
## Search sources
`api/search.js` has one function per source (`osm`, `google`), picked from the Source dropdown on the Find leads tab. `SEARCH_PROVIDER` sets the default. To add another source, write one more function and add it to `PROVIDERS`.
 
- OpenStreetMap needs no key. Set `OSM_CONTACT` to your email (their usage policy asks for it). `OSM_COUNTRY` limits location lookups to one country (default `us`).
- Google Maps needs `GOOGLE_PLACES_API_KEY`.
- OpenStreetMap searches use a free public server. If one times out, try a smaller area such as a neighborhood.
 
