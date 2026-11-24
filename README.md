# MASAR · التوأم الرقمي لجامعة سوهاج الجديدة

A 3D digital twin of the New Sohag University campus (Al-Kawamel), built from the original survey files for 2006 – 2026.

**What it does**
- Cinematic opening: the globe spins, then the camera dives onto the campus and the buildings rise as 1,856 lights switch on.
- 3D satellite map with every building raised to its real height, glowing roads and a night lighting layer.
- Time machine: switch between 2006, 2011, 2016, 2021 and 2026, or press ▶ to watch the campus grow.
- Before/after slider ("قارن"): two years side by side with a draggable divider. Both sides move together in 3D, and a bar shows what changed (light poles, km of roads, built area).
- Building cards: photos, real height, footprint, measured size, first year the building appears, and every floor and room. You can search for a room inside a building.
- **Shortest path** ("اتجاهات"): routes between any two points (gates, buildings, rooms, a point picked on the map, or your GPS location) along the 2026 road network. Shows a glowing animated route, distance, walking and driving time, and steps. Open it from the building card ("اتجاهات إلى هنا") or ask the assistant ("من البوابة 1 إلى معمل 309"). The road graph is built by `scripts/build_data.py` into `public/data/roads.json`, and routing runs in the browser (`src/route/router.ts`).
- Search (⌘K or `/`): finds buildings, places and individual rooms ("معمل 309", "شئون الطلاب").
- **The film** ("شاهد الفيلم"): a 10-chapter cinematic tour with letterbox bars, film grain, chapter title cards, subtitles and a generated ambient score (Web Audio, no audio files). Space pauses, ← skips a chapter.
- **Map gallery** ("المعرض"): a cinematic atlas of 19 GIS maps in two chapters. Chapter 1 covers land use, solar radiation and network analyses (routes, service areas, closest facility, OD matrix). Chapter 2 is a time-lapse of the NDVI, SAVI and CCI vegetation indices for 2006, 2011, 2021 and 2026. It has letterbox bars, chapter title cards, slow camera push-ins, film grain, a light that matches each map, and autoplay. Keys: ← / → move between maps, Space pauses, `G` shows all maps, Esc closes. Open it directly with `?gallery`. The images are in `public/images/maps/` and the captions in `src/gallery/maps.ts`.
- **Voice assistant** (gold orb, or press `M`): speak or type in Arabic. For example "خذني إلى كلية الهندسة", "فين معمل 309", "اعرض الحرم في 2011", "كم عمود إنارة؟", "شغّل الليل", "ابدأ الجولة". Voice input uses the browser's speech recognition (Chrome, Edge, Safari). Spoken replies are off by default and switch on with the speaker button.
- A stats panel with 20-year trends, layer filters, and day / night mode.
- Arabic RTL layout that works on phones.

Add `?skip` to the URL to jump past the intro.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

The site is fully static (Vite build to `dist/`), so it needs no server or keys.

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repo and keep the detected settings (framework *Vite*, build `npm run build`, output `dist`). `vercel.json` already sets these and the cache headers.

Or deploy from the terminal:

```bash
npx vercel --prod
```

## Gallery maps

The atlas (`?gallery`) gets its maps from the shared Google Drive folder "Final layout"
(`1aQjwLhdVegAGc_oI8IeuicxIHnLcZSWB`), not from git. The folder must stay shared as *anyone with the link*.

`npm run maps` (also run automatically before every `npm run build`, and before `npm run dev` when no maps are present yet):

1. walks the Drive folder,
2. matches its files to the entries in `src/gallery/catalog.ts`,
3. resizes each map (longest side 1600 px), makes a 360 px thumbnail and names both with a content hash,
4. writes them to `public/images/maps/` and the list to `src/gallery/images.gen.json` (both git-ignored).

Maps that are not in Drive (solar radiation, stop order, closest facility) live in `assets/maps-local/`.

**Adding or changing a map**

- Replace a picture in Drive (ideally with *Manage versions* so its name stays) and redeploy.
- A new year in a time-lapse folder (e.g. `تصنيف/2016`) joins that time-lapse automatically.
- Anything else new in Drive shows up in the log as `warn: not in gallery: <path>`. Add an entry for it in `catalog.ts` with a title and description.
- An `error:` line means an entry no longer matches Drive (a file was re-uploaded under a new name, or a folder now holds two images). The build stops so a broken gallery is never deployed; the last good deploy stays live.

**If Google blocks the build server**

The default needs no key. If a deploy log shows Drive refusing requests, create an API key in Google Cloud
(enable the *Google Drive API*, restrict the key to it) and set it as the `GOOGLE_API_KEY` environment variable
in Cloudflare Pages and Vercel. The script then uses the official Drive API.

## Data

| Path | What it is |
|---|---|
| `data-raw/kmz/` | Original KMZ exports for 2006, 2011, 2021 and 2026. These are the preferred source because they keep building courtyards as holes and put the name on every part |
| `data-raw/dwg-geojson/` | The five AutoCAD drawings from Drive, converted with LibreDWG with their ArcGIS attributes (name, folder, height) joined on. Only used for years without a KMZ (currently 2016) |
| `data-raw/site/` | Building profiles, floor contents, measurements and photos from the original MASAR site |
| `scripts/build_data.py` | Turns the raw data into `public/data/` (categories, heights, building links, stats) and compresses the photos |
| `public/data/years/*.geojson` | One map file per year, used by the site |
| `public/data/profiles.json` | Buildings with floors, rooms, photos and descriptions |
| `public/data/stats.json` | Counts per year (lights, road km, built area) |

To rebuild the data after changing the raw files:

```bash
python3 -m venv .venv && .venv/bin/pip install shapely pyproj
npm run data
```

To convert a new DWG drawing: `brew install libredwg`, then `dwgread -O GeoJSON` and `dwgread -O JSON` on the file. Join the two with the script in `data/dwg_join.py` (or copy its logic) and place the result in `data-raw/dwg-geojson/<year>.geojson`.

### Linking a building to its details
Map shapes are linked to building profiles by name in `ALIASES` inside `scripts/build_data.py`. `SHARED` lists buildings that house more than one faculty (for example Agriculture + Law). Four profiles have no map shape yet: المركزية, كلية التكنولوجيا والتعليم, كلية تكنولوجيا العلوم الصحية التطبيقية and مدينة الطلاب الجامعية. Add their names there once their shapes are drawn.

## Stack
Vite · React · TypeScript · MapLibre GL (globe, 3D extrusions, heatmap glow) · Motion · Lucide icons.
Satellite imagery © Esri World Imagery. Check Esri's terms before a high-traffic public launch, or switch the `SAT` URL in `src/map/engine.ts` to another provider (MapTiler, Mapbox).
