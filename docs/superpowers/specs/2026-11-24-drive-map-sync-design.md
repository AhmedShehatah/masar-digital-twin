# Gallery maps from Google Drive: design

## Why

The project's maps live in a shared Google Drive folder ("Final layout",
`1aQjwLhdVegAGc_oI8IeuicxIHnLcZSWB`). Today someone has to download them by
hand, edit them and commit them to `public/images/maps`. That is why the gallery
shows only 19 of the 53 maps. Drive should be the one place maps are kept. The
website should pick them up at build time with nobody downloading anything, and
the gallery should show the whole collection, not only the first 19.

## Goals

- Every build pulls the gallery images from the public Drive folder, resizes them
  and makes thumbnails. Nothing is downloaded by hand and no map images are in git.
- The gallery shows all 53 Drive maps, plus the 3 maps that exist only locally
  (see "What's in Drive").
- Replacing an image in Drive, then redeploying, updates the site.
- A new year dropped into an existing time-series folder (e.g. `تصنيف/2016`)
  joins that time-lapse with no code change.
- When Drive and the gallery list drift apart, the build says so clearly.

## Non-goals

- Loading images from Drive at runtime. The site stays fully static.
- Automatic redeploys when Drive changes. Redeploys stay manual or happen on push.
- Editing captions from Drive. Titles and descriptions stay in code.

## Anti-goals (failure even if it "works")

- A deploy that silently ships a gallery with missing or broken images.
- Visitors seeing a stale map for a week after it was replaced. The current
  cache is 1 week, `immutable`.
- The cinematic feel getting worse: slow, stuttering crossfades, or legends
  cropped off because of mismatched aspect ratios.

## What's in Drive (surveyed 2026-11-24)

The folder is public. The no-key listing at `drive.google.com/embeddedfolderview?id=…` works,
and so does `drive.usercontent.google.com/download?id=…&confirm=t`. All files are
already web-sized: 1280 px or smaller and under 250 KB, except three 3D PNGs of
360–840 KB.

| Drive folder | Content | Files |
|---|---|---|
| خريطه الأساس | Satellite base map + location in the governorate | 1 |
| خريطه جيولوجيا | Geology | 1 |
| خريطه التربه | Soil | 1 |
| تحليل طبوغرافي | Contours, DEM (51–701), slope, aspect | 4 |
| تحليل الهيدرولوجي | Watersheds, stream order, flood-risk points | 1 |
| المناخ/{إتجاه الرياح, الرطوبه, درجه الحراره, سرعه الرياح} | Wind direction, humidity, air temperature, wind speed | 4 |
| درجه حراره السطح/{2006, 2016, 2026} | Land surface temperature, 4 seasons per image (2011 and 2021 folders empty) | 3 |
| الشف من جوجل إيرث/{2006, 2011, 2021, 2026} | Land use traced from Google Earth, by year (2016 empty). 2026 = today's `landuse.jpg` | 4 |
| تصنيف/{2006, 2011, 2021, 2026} | Built / farmland / vacant classification by year (2016 empty) | 4 |
| مؤشرات/{NDVI, SAVI, CCI}/{2006…2026} | Vegetation indices, now incl. 2016 | 15 |
| تحليل الشبكي | OD matrix, service areas, best route (= 3 of today's 5) | 3 |
| رفع ثلاثي الابعاد/{2016, 2021, 2026} | 3D campus renders, various angles | 3 + 6 + 3 |

**Only in the repo:** `solar` (solar radiation), `route-direct` (stop order),
`closest-facility`. These move to `assets/maps-local/` and go through the same
processing. The current `landuse.jpg` is dropped because Google Earth 2026
replaces it.

## Approaches

1. **Load from Drive at runtime** by file ID. Rejected: Google doesn't support
   showing Drive files on other sites, those links get rate-limited or broken,
   there are no thumbnails or edge caching, and new maps still need captions.
2. **Cloudflare Worker proxy with edge caching.** Updates without a redeploy, but
   it adds a runtime service to run and debug, and that isn't needed.
3. **Copy at build time (chosen by the user).** A script fetches Drive during
   `npm run build`, processes the images into `public/images/maps`, and Vite
   ships them as static files. The site stays fast and the setup simple. Updates
   need a redeploy.

## Design

### The map list (`src/gallery/maps.ts`)

Still hand-written, because captions, focus points and chapters are curated. Each
entry gets a `from` that says where its image comes from:

- `from: 'خريطه جيولوجيا'`: a folder that must hold exactly one image.
- `from: 'تحليل طبوغرافي/6048464566376665309.jpg'`: a specific file in a
  folder with several. The match is on file name, so if someone uploads a new
  copy instead of using "Manage versions", the build fails and names the entry
  (see Drift).
- `from: 'local:solar.jpg'`: from `assets/maps-local/`.

**Time series** are declared once per series, not once per year:
`series({ from: 'تصنيف', reel: 'class', title, desc, yearNotes? })`. At build
time every year subfolder that holds one image becomes a frame of the reel, in year
order. Per-year notes are optional, and a year without one shows only the
series description. The vegetation indices become three such series. The
index × year switcher derives its years from the data instead of the current
hard-coded `VEG_YEARS`.

### The sync script (`scripts/sync-maps.mjs`)

Node with no Google API key:

1. Walk the Drive tree through `embeddedfolderview`, recursively.
2. Resolve every entry and series against the tree.
3. Download each needed file with up to 6 in parallel and 3 retries.
4. With `sharp` (new devDependency): auto-rotate, flatten PNG transparency onto
   white, cap the long side at 1600 px with no upscaling, and save as JPEG q82,
   progressive. Also make a 360-px-wide thumbnail.
5. Name outputs `<id>.<8-char content hash>.jpg` (and `thumb/…`) in
   `public/images/maps/`, after clearing it.
6. Write `src/gallery/images.gen.json`, `{ [id]: { src, thumb, w, h, year? } }`,
   plus the expanded series frames. `maps.ts` reads `w`/`h` from it, so the
   hard-coded sizes go away.

**Drift:**
- An entry or series that resolves to nothing, or a single-image folder with
  several images, fails the build and prints the Drive path.
- Any Drive image used by no entry prints a warning listing its path, so new
  uploads get noticed. This doesn't fail the build.
- Drive unreachable or a download failing after retries fails the build.
  Cloudflare keeps the last good deploy live.

**Hooks:**
- `"prebuild": "node scripts/sync-maps.mjs"` runs on every build.
- `npm run maps` runs it by hand.
- `predev` runs it only when `images.gen.json` is missing, so dev startup stays
  instant.

`public/images/maps/` and `src/gallery/images.gen.json` go in `.gitignore`,
and the 19 committed images are removed from git.

**Caching:** names are content-hashed, so `/images/maps/*` gets
`max-age=31536000, immutable` in both `public/_headers` and `vercel.json`.
Other `/images/*` paths keep their current rules.

### Gallery chapters (my call, open to correction)

The gallery goes from 2 chapters and 19 shots to 6 chapters and 56 shots. They
are ordered as a story: the place, its climate, how it changed, the greenery, the
campus's networks, then the 3D campus as the finale.

1. **المكان** (the land): base map, geology, soil, contours, DEM, slope,
   aspect, flood risk.
2. **المناخ** (climate): air temperature, humidity, wind direction, wind speed,
   solar radiation, then the surface-temperature time-lapse (2006, 2016, 2026).
3. **عشرون عامًا من التحوّل** (two decades of change): Google Earth land-use
   time-lapse (2006, 2011, 2021, 2026), then the classification time-lapse
   (same years).
4. **عشرون عامًا من الخُضرة** (existing): NDVI, SAVI and CCI × 2006–2026,
   now with 2016.
5. **الحرم تحت المجهر** (existing): best route, stop order, service areas,
   closest facility, OD matrix.
6. **الحرم مجسّمًا** (the campus in 3D): 12 renders as single shots tagged with
   their year. They are not crossfaded, because the camera angles differ from
   frame to frame.

I draft the Arabic titles and descriptions from what each map shows: its legend,
ranges and features. Users review them in the PR. No numbers are invented
beyond what the legend shows.

### Gallery code changes (`src/components/Gallery.tsx`, `styles.css`)

- Chapter ids become a 6-member union.
- The "MASAR · ATLAS" pre-title stays on the first chapter's card,
  whichever chapter that is.
- Slide time depends on the shot, not the chapter: 3.8 s for a time-lapse
  frame, 7.5 s for a single map, 5 s for a 3D render.
- The push-in zoom is 1.22 for time-lapse frames and 1.09 otherwise.
- The year rail shows the current reel's years for any time-lapse, not only the
  vegetation one. The NDVI/SAVI/CCI tabs still show only on vegetation shots.
- A reel's frame uses the first image's aspect ratio, and images inside a reel
  use `object-fit: contain` on the existing light frame background. Single
  shots keep `cover`. This handles the Google Earth and classification series,
  whose sizes differ by year.
- Grid tiles use the label `<short title> · <year>` whenever a shot has a year.
- Focus points: the main map panel sits on the left in nearly every layout, so
  the default focus is `[30, 45]`. I tune it per map where that looks wrong.

## Constraints

- Cloudflare Pages runs `npm run build` on Linux x64, where `sharp` installs a
  prebuilt binary. Vercel is the same.
- `embeddedfolderview` is an undocumented Google page, and Google sometimes
  blocks or rate-limits data-centre IPs such as build servers. Keyless access was
  only tested from a laptop. So the script has two interchangeable listers and
  downloaders, and both are built now:
  - **No key (default):** `embeddedfolderview` + `drive.usercontent.google.com`.
  - **`GOOGLE_API_KEY` set:** Drive API v3 `files.list` (`q='<id>' in parents`)
    and `files/<id>?alt=media`. A plain API key works because the folder is public.

  Rollout: the first deploy runs without a key. If the build log shows Drive
  blocking it, create a key restricted to the Drive API and add it as an env var
  in Cloudflare Pages (and Vercel). The README documents this.
- Image quality: the committed vegetation maps (1462×1034) are the Drive images
  (1280×906) resized up, with the same framing and no cropping. Using the Drive
  files directly costs no real detail. No crop, trim or alignment step is needed.
- The Drive folder must stay shared as "anyone with the link".

## Left to the builder

- The exact retry and backoff numbers, parallelism, and log formatting.
- Exact focus points and the wording of the drafted captions, which get final
  review in the PR.
- Whether `images.gen.json` is imported as JSON or wrapped in a small typed module.
