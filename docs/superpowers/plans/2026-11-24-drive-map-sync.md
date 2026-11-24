# Gallery Maps from Google Drive: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull every gallery map from the public Drive folder at build time, and grow the gallery from 2 chapters and 19 maps to 6 chapters and 56 maps.

**Architecture:** A Node script (`scripts/sync-maps.ts`, run by Node 24's built-in TypeScript support) walks the Drive folder, matches its files against a hand-written catalog (`src/gallery/catalog.ts`), processes them with `sharp` into content-hashed files under `public/images/maps/`, and writes `src/gallery/images.gen.json`. `src/gallery/maps.ts` combines the catalog and the generated JSON into `SHOTS`. `Gallery.tsx` is generalised from one hard-coded vegetation time-lapse to any time-lapse.

**Tech Stack:** Node 24 (type stripping, `node:test`, global `fetch`), `sharp` 0.35, Vite 8, React 19, TypeScript 7.

**Spec:** `docs/superpowers/specs/2026-11-24-drive-map-sync-design.md`

## Global Constraints

- Drive root folder id: `1aQjwLhdVegAGc_oI8IeuicxIHnLcZSWB`.
- Keyless listing: `https://drive.google.com/embeddedfolderview?id=<id>`. Keyless download: `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`.
- With `GOOGLE_API_KEY`: listing via `https://www.googleapis.com/drive/v3/files?q='<id>'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&key=<key>`, downloads via `https://www.googleapis.com/drive/v3/files/<id>?alt=media&key=<key>`.
- Image processing: auto-rotate, flatten onto `#ffffff`, cap the long side at 1600 px with no upscaling, JPEG quality 82, progressive, mozjpeg. Thumbnails 360 px wide.
- Output names: `<id>.<first 8 hex of sha256(full jpeg)>.jpg` in `public/images/maps/`, and the same name in `public/images/maps/thumb/`.
- Downloads: 6 at a time, 3 retries with backoff.
- These failures exit with code 1: an entry resolves to nothing, a single-image folder holds several images, Drive can't be reached, or a download still fails after retries.
- Drive images used by no entry print a warning and do not fail the build.
- `/images/maps/*` cache header: `public, max-age=31536000, immutable`.
- Chapter order: `land`, `climate`, `change`, `veg`, `campus`, `model3d`.
- Slide time: 3800 ms for a time-lapse frame, 7500 ms for a single map, 5000 ms for a 3D render.
- Push-in zoom: 1.22 for time-lapse frames, 1.09 otherwise. Default focus: `[30, 45]`.
- Captions are Arabic, with no numbers beyond what the map's legend shows.
- Node ≥ 24: `.nvmrc` holds `24`, and `package.json` sets `"engines": { "node": ">=24" }`.

## Review Focus

1. **Arabic names in two Unicode forms, or with hidden direction marks.** The root folder is literally `Final layout‏` and ends in a U+200F mark. Matching must still succeed. Normalise names to NFC and strip U+200E, U+200F and U+202A–U+202E on both sides. Tested in Task 1 (`normalizeName`) and Task 2.
2. **HTML entities in Drive names** (`&amp;`, `&#39;`). These must decode to the real characters. Tested in Task 1.
3. **Files in Drive that aren't images** (KMZ, PDF, Google Docs). Ignore them: they don't match entries and don't trigger "unused" warnings. Only `.jpg`, `.jpeg`, `.png` and `.webp` count. Tested in Task 2.
4. **Drive sending an HTML page instead of the image** (virus-scan page, quota, "unusual traffic"), even with status 200. Treat it as a failed download and retry. Tested in Task 1 (`download` rejects non-`image/*` responses).
5. **An empty folder, or an empty year folder inside a series** (e.g. `تصنيف/2016` today). An empty listing is not an error, and the series skips that year. Tested in Task 1 (empty page) and Task 2.

---

### Task 0: Branch

- [ ] **Step 1:** `git switch -c drive-map-sync`

### Task 1: Drive client

**Files:**
- Create: `scripts/drive.ts`, `scripts/drive.test.ts`
- Create: `scripts/__fixtures__/folder-files.html`: copy of `embeddedfolderview` for `14VnU35JPXvl4FhvAtXz51w3DKJCBq0JF` (3 files)
- Create: `scripts/__fixtures__/folder-folders.html`: copy for `1igMxaabSEvdTADgrcuF-wumNPbu7YGbi` (3 subfolders)

**Interfaces:**
- Produces:
  - `interface DriveItem { id: string; name: string; folder: boolean }`
  - `interface DriveFile { id: string; path: string; name: string }`. `path` is the folder path from the root, joined with `/`, e.g. `مؤشرات/NDVI/2006`, with names normalised.
  - `normalizeName(s: string): string`
  - `parseFolderView(html: string): DriveItem[]`
  - `type Lister = (folderId: string) => Promise<DriveItem[]>`
  - `keylessLister: Lister`, `apiLister(key: string): Lister`
  - `walk(list: Lister, rootId: string): Promise<DriveFile[]>`. Depth-first, with items sorted by name within each folder.
  - `download(id: string, key?: string): Promise<Buffer>`

- [ ] **Step 1: Write failing tests** (`node:test` + `node:assert/strict`)
  - `parseFolderView(fixture files)` returns 3 items, none `folder`, with ids `1cHKiCEGJ4WSjjM1MApASUHXtzsyAGh-U`, `1sAqzBgwpev0uRqlBWd0bA5pYmH2s2NCT`, `1C0qN9-Ei4FxBeBYq7A-7mEwUft5tl975` and name `5769252582164468398.jpg` for the first.
  - `parseFolderView(fixture folders)` returns names `CCI`, `NDVI`, `SAVI`, all `folder: true`.
  - `parseFolderView('<html><body></body></html>')` returns `[]`.
  - A hand-written entry whose title is `a &amp; b&#39;s` gives the name `a & b's`.
  - `normalizeName('Final layout‏')` returns `'Final layout'`. `normalizeName('خريطه'.normalize('NFD'))` equals `'خريطه'.normalize('NFC')`.
  - `walk` with a fake `Lister` (an in-memory tree: root → `مؤشرات` → `NDVI` → `2006` → `a.jpg`, plus root → `x.jpg`) returns `[{path:'', name:'x.jpg'}, {path:'مؤشرات/NDVI/2006', name:'a.jpg'}]` in the order a depth-first walk gives.
  - `download`: stub `globalThis.fetch` to return status 200 with `content-type: text/html`. Expect a rejection whose message includes `not an image`.
- [ ] **Step 2:** Run `node --test scripts/`. Expected: the tests fail because the module is missing.
- [ ] **Step 3:** Implement `scripts/drive.ts`.
  - The parser regex goes from `href="https://drive.google.com/(file/d|drive/folders)/<id>` to the next `flip-entry-title">NAME</div>`.
  - Decode `&amp; &lt; &gt; &quot; &#39; &#NNN;`.
  - `apiLister` pages through `nextPageToken`. `folder` is true when `mimeType === 'application/vnd.google-apps.folder'`.
  - `download` throws `Drive returned <type>, not an image` when the response isn't `image/*`, and throws on a status other than 200.
- [ ] **Step 4:** Run `node --test scripts/`. Expected: all pass.
- [ ] **Step 5:** Commit: `Add Drive folder client for map sync`.

### Task 2: Catalog types and resolver

**Files:**
- Create: `src/gallery/catalog.ts`. Types plus empty `CHAPTERS`/`ENTRIES` arrays, which Task 5 fills. It must import nothing, so Node can load it from scripts.
- Create: `scripts/resolve.ts`, `scripts/resolve.test.ts`

**Interfaces:**
- Consumes: `DriveFile`, `normalizeName` (Task 1).
- Produces (in `catalog.ts`):
  - `type ChapterId = 'land' | 'climate' | 'change' | 'veg' | 'campus' | 'model3d'`
  - `type VegIndex = 'NDVI' | 'SAVI' | 'CCI'`
  - `interface Chapter { id: ChapterId; kicker: string; title: string; sub: string }`
  - `interface Entry { key: string; chapter: ChapterId; mode: 'single' | 'years' | 'all'; from: string; title: string; short?: string; desc: string; yearNotes?: Record<number, string>; focus?: [number, number]; kind?: 'map' | 'render'; index?: VegIndex }`
  - `export const CHAPTERS: Chapter[]`, `export const ENTRIES: Entry[]`
- Produces (in `resolve.ts`):
  - `interface Job { id: string; entry: string; year?: number; source: { drive: string } | { local: string } }`. `drive` is a file id and `local` is a file name in `assets/maps-local/`.
  - `resolveCatalog(entries: Entry[], files: DriveFile[]): { jobs: Job[]; errors: string[]; unused: string[] }`

The resolution rules:
- **`single`:** `from` takes one of three forms.
  - A folder path holding exactly one image gives that image. Zero images, or more than one, is an error naming `from`.
  - A `folder/name.ext` gives that file. Missing is an error.
  - `local:name` gives `{ local: name }`.
  - The job id is `key`.
- **`years`:** every direct subfolder of `from` whose name matches `/^\d{4}$/` and holds exactly one image gives one job, with id `${key}-${year}`, in ascending year order. An empty year folder is skipped. A year folder with more than one image is an error. No years at all is an error.
- **`all`:** every image anywhere under `from`, sorted by path then name. The year is the nearest `/^\d{4}$/` path segment. The id is `${key}-${year}-${n}`, where `n` counts from 1 within each year.
- **Images and unused:** only names ending in `.jpg`, `.jpeg`, `.png` or `.webp` (any case) count as images. `unused` holds `path/name` for every image no job used.
- **Matching:** `from` is compared after `normalizeName` on each path segment.

- [ ] **Step 1: Write failing tests** using a small hand-built `DriveFile[]`:
  - `single` from the folder `خريطه جيولوجيا` with one jpg gives one job with id `geology`.
  - The same folder with two jpgs gives an error containing `خريطه جيولوجيا`.
  - `single` from `تحليل طبوغرافي/b.jpg` picks `b.jpg` among `a.jpg` and `b.jpg`.
  - `single` from `local:solar.jpg` gives `source: { local: 'solar.jpg' }`.
  - `years` over `تصنيف/{2006: 1 jpg, 2016: none, 2026: 1 jpg}` gives ids `class-2006`, `class-2026`.
  - `years` where one year holds 2 jpgs gives an error.
  - `all` over `3d/{2016: a.jpg, b.jpg; 2026: 1.png}` gives ids `3d-2016-1`, `3d-2016-2`, `3d-2026-1`, with years.
  - A `.kmz` and a `.pdf` beside the images appear in neither `jobs` nor `unused`.
  - An image no entry uses appears in `unused` as `folder/name.jpg`.
  - An entry `from` written in NFD with a trailing U+200F still matches a Drive path in NFC.
- [ ] **Step 2:** Run `node --test scripts/`. Expected: the new tests fail.
- [ ] **Step 3:** Implement `catalog.ts` (types and empty arrays) and `resolve.ts`.
- [ ] **Step 4:** Run `node --test scripts/`. Expected: all pass.
- [ ] **Step 5:** Commit: `Add map catalog types and Drive resolver`.

### Task 3: Image processing

**Files:**
- Modify: `package.json`. Add devDependency `sharp@^0.35.5` and script `"test": "node --test scripts/"`.
- Create: `scripts/process.ts`, `scripts/process.test.ts`

**Interfaces:**
- Produces: `processImage(input: Buffer): Promise<{ full: Buffer; thumb: Buffer; w: number; h: number; hash: string }>`

- [ ] **Step 1: Write failing tests.** Generate the inputs with `sharp({ create: … })`.
  - A 3000×1000 PNG gives `w === 1600`, `h === 533` (or 534), JPEG magic bytes `ff d8`, a thumbnail width of 360, and `hash` matching `/^[0-9a-f]{8}$/`.
  - An 800×600 input gives `w === 800`, `h === 600`, so there's no upscaling.
  - A fully transparent 10×10 PNG gives a JPEG whose pixel (0,0) is white, within ±3 per channel.
  - Two calls on the same input give the same `hash`.
- [ ] **Step 2:** Run `npm i -D sharp@^0.35.5 && npm test`. Expected: the new tests fail.
- [ ] **Step 3:** Implement with `sharp(input).rotate().flatten({ background: '#ffffff' }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, progressive: true, mozjpeg: true })`. The thumbnail resizes `full` to width 360. `w` and `h` come from the output's metadata.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `Add map image processing`.

### Task 4: Sync script and build wiring

**Files:**
- Create: `scripts/sync-maps.ts`
- Move: `git mv public/images/maps/{solar,route-direct,closest-facility}.jpg assets/maps-local/`
- Delete from git: everything else in `public/images/maps/`, thumbnails included (`git rm -r --cached public/images/maps` after the moves, then delete the files).
- Modify: `.gitignore`. Add `public/images/maps/` and `src/gallery/images.gen.json`.
- Modify: `package.json`. Add these scripts and engines:
  - `"maps": "node scripts/sync-maps.ts"`
  - `"prebuild": "node scripts/sync-maps.ts"`
  - `"predev": "node scripts/sync-maps.ts --if-missing"`
  - `"engines": {"node": ">=24"}`
- Create: `.nvmrc` containing `24`
- Modify: `public/_headers`. Add `/images/maps/*` with `! Cache-Control` followed by `Cache-Control: public, max-age=31536000, immutable`.
- Modify: `vercel.json`. After the `/images/(.*)` rule, add a `/images/maps/(.*)` rule with the same value.
- Modify: `README.md`. Add a "Gallery maps" section covering:
  - Drive is the source, and the folder must stay "anyone with the link".
  - What `npm run maps` does, and what the drift warnings and errors mean.
  - How to add a map, including how `years` series pick up new years on their own.
  - The `GOOGLE_API_KEY` fallback: create a Google Cloud API key restricted to the Drive API, and set it in Cloudflare Pages and Vercel.

**Interfaces:**
- Consumes: Tasks 1–3, and `ENTRIES` from `catalog.ts`.
- Produces: `src/gallery/images.gen.json` with this shape:
  `{ "generatedAt": string, "shots": [{ "id": string, "entry": string, "year"?: number, "src": "/images/maps/<id>.<hash>.jpg", "thumb": "/images/maps/thumb/<id>.<hash>.jpg", "w": number, "h": number }] }`. Shots are in `ENTRIES` order, with series frames kept in resolver order.

- [ ] **Step 1:** Implement `main()` in this order:
  1. With `--if-missing`, exit 0 if `images.gen.json` exists.
  2. Choose the lister from `process.env.GOOGLE_API_KEY`.
  3. `walk` the root.
  4. `resolveCatalog`. Print `unused` as `warn: not in gallery: <path>`. If there are `errors`, print each and exit 1.
  5. Empty `public/images/maps/`.
  6. Download and process with 6 at a time. Retry 3 times with a 1 s, 2 s, 4 s backoff. A `local` source reads `assets/maps-local/<name>`.
  7. Write the files and the JSON.
  8. Print `synced N maps (M from Drive, K local)`.

  Any exception prints its message and exits 1.
- [ ] **Step 2:** Temporarily add one test entry to `ENTRIES`: `{ key: 'geology', chapter: 'land', mode: 'single', from: 'خريطه جيولوجيا', title: 't', desc: 'd' }`. Run `npm run maps`. Expected:
  - The log says `synced 1 maps (1 from Drive, 0 local)` and lists 52 `warn: not in gallery` lines.
  - `public/images/maps/geology.<hash>.jpg` exists, and so does its thumbnail.
  - The JSON has 1 shot with `w: 1280, h: 905`.
- [ ] **Step 3:** Run `GOOGLE_API_KEY=bogus npm run maps`. Expected: exit 1, with a message that mentions the Drive API. This shows the key path is wired up.
- [ ] **Step 4:** Remove the temporary entry. Run `npm test`. Expected: pass.
- [ ] **Step 5:** Commit: `Sync gallery maps from Google Drive at build time`. This includes the image removals, `.gitignore`, headers, README and `.nvmrc`.

### Task 5: Catalog content and `maps.ts`

**Files:**
- Modify: `src/gallery/catalog.ts`. Fill `CHAPTERS` and `ENTRIES`.
- Rewrite: `src/gallery/maps.ts`

**Interfaces:**
- Consumes: `images.gen.json` (Task 4), `CHAPTERS` and `ENTRIES` (this task).
- Produces (`maps.ts`, used by Task 6):
  - `interface MapShot { id: string; chapter: ChapterId; title: string; short: string; desc: string; w: number; h: number; focus: [number, number]; reel: string; kind: 'map' | 'render'; index?: VegIndex; year?: number; src: string; thumb: string }`
  - `SHOTS: MapShot[]`
  - Re-exports `CHAPTERS`, `VEG_INDICES: VegIndex[] = ['NDVI', 'SAVI', 'CCI']`, `ChapterId`, `VegIndex`
  - `reelOf(s: MapShot): MapShot[]`
  - `src(s: MapShot): string` and `thumb(s: MapShot): string`, kept so `Gallery.tsx` keeps compiling
  - `reel` is `entry.key` for `years` entries and the shot id otherwise
  - `desc` is `yearNotes[year] + ' ' + desc` when a note exists
  - `short` defaults to `title`
  - `focus` defaults to `[30, 45]`
  - `kind` defaults to `'map'`

The chapters and entries, in this order:

| Chapter | key | mode | from |
|---|---|---|---|
| `land` (kicker الفصل الأول, title المكان) | base | single | `خريطه الأساس` |
| | geology | single | `خريطه جيولوجيا` |
| | soil | single | `خريطه التربه` |
| | contours, dem, slope, aspect | single | `تحليل طبوغرافي/6048464566376665306.jpg`, `…310.jpg`, `…309.jpg`, `…308.jpg` |
| | flood-risk | single | `تحليل الهيدرولوجي` |
| `climate` (الفصل الثاني, المناخ) | air-temp, humidity, wind-dir, wind-speed | single | `المناخ/درجه الحراره`, `المناخ/الرطوبه`, `المناخ/إتجاه الرياح`, `المناخ/سرعه الرياح` |
| | solar | single | `local:solar.jpg` (keep today's caption) |
| | lst | years | `درجه حراره السطح` |
| `change` (الفصل الثالث, عشرون عامًا من التحوّل) | landuse | years | `الشف من جوجل إيرث` (adapt today's landuse caption) |
| | class | years | `تصنيف` |
| `veg` (الفصل الرابع, عشرون عامًا من الخُضرة, today's sub with no year range hard-coded) | ndvi, savi, cci | years | `مؤشرات/NDVI`, `مؤشرات/SAVI`, `مؤشرات/CCI` (keep today's index captions and `YEAR_NOTE`, add a 2016 note, `focus: [27, 40]`) |
| `campus` (الفصل الخامس, الحرم تحت المجهر, today's sub) | route-network | single | `تحليل الشبكي/5769252582164468400.jpg` |
| | route-direct | single | `local:route-direct.jpg` |
| | service-area | single | `تحليل الشبكي/5769252582164468399.jpg` |
| | closest-facility | single | `local:closest-facility.jpg` |
| | od-matrix | single | `تحليل الشبكي/5769252582164468398.jpg` (keep today's captions and focus points for all five) |
| `model3d` (الفصل السادس, الحرم مجسّمًا) | model | all | `رفع ثلاثي الابعاد`, `kind: 'render'`, `focus: [50, 50]` |

- [ ] **Step 1:** Open each new map in `public/images/maps/` after a sync. Write the Arabic `title`, `short` (a 2–3 word grid label) and `desc` from what each map shows: its legend, classes and ranges. Tune `focus` where the main map panel isn't at the default.
- [ ] **Step 2:** Rewrite `maps.ts` to build `SHOTS` from `images.gen.json` plus `ENTRIES`. Throw at module load if a shot's `entry` has no catalog entry.
- [ ] **Step 3:** Run `npm run maps`. Expected: `synced 56 maps (53 from Drive, 3 local)` and zero `warn:` lines.
- [ ] **Step 4:** Run `npx tsc -b`. Expected: errors only in `Gallery.tsx`, from the API it hasn't been updated to yet, and none in `src/gallery/`.
- [ ] **Step 5:** Commit: `Catalog all 56 maps in six chapters`.

### Task 6: Generalise the gallery

**Files:**
- Modify: `src/components/Gallery.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `SHOTS`, `CHAPTERS`, `VEG_INDICES`, `reelOf`, `src`, `thumb`, `MapShot` (Task 5).

- [ ] **Step 1:** Make these changes in `Gallery.tsx`:
  - Start `card` at `SHOTS[0].chapter`. Show `MASAR · ATLAS` when `card === CHAPTERS[0].id`.
  - Replace `SLIDE_MS[chapter]` with `slideMs(s)`: 5000 for a render, 3800 when `reelOf(s).length > 1`, otherwise 7500. Use it for both the progress bar and the Ken Burns duration, which is the total over the reel plus 1500.
  - Set `--kb-to` to 1.22 when the reel has more than one shot, otherwise 1.09.
  - Take the frame's `--ar` from `reelOf(shot)[0]`.
  - Show the year rail whenever `shot.year` is set and the reel has more than one shot. Its years are `reelOf(shot).map(s => s.year)`, and clicking one jumps within the reel.
  - Show the index tabs only when `shot.index` is set. A tab jumps to the same index and year, or to that index's first year if the year is missing.
  - Give grid tiles the label `${s.short} · ${s.year}` when `s.year` is set, otherwise `s.short`. Give 3D renders the year chip in the caption, which the existing `shot.year` rendering already handles.
  - Remove `VEG_YEARS`.
- [ ] **Step 2:** In `styles.css`, add `.g-kb.fit img { object-fit: contain; }` and apply the `fit` class to `.g-kb` when the reel has more than one shot.
- [ ] **Step 3:** Run `npx tsc -b`. Expected: no errors.
- [ ] **Step 4:** Verify in the browser. Start the dev server with `preview_start`, adding a `.claude/launch.json` entry for `npm run dev` on port 5173 if it's missing. Open `/?gallery`, then check:
  - The first card shows `MASAR · ATLAS` and المكان.
  - Advancing to the surface-temperature time-lapse shows a 3-year rail (2006, 2016, 2026) and crossfades in one frame.
  - The vegetation chapter shows the NDVI/SAVI/CCI tabs and 5 years.
  - The Google Earth series shows its 2011 frame (1080×756) letterboxed rather than cropped.
  - The grid (`G`) lists 6 chapters and 56 tiles.
  - 3D renders show a year in the caption.
  - The console has no errors.
  - Take screenshots at desktop size and at the `mobile` preset.
- [ ] **Step 5:** Commit: `Generalise gallery time-lapses for six chapters`.

### Task 7: Full build check

- [ ] **Step 1:** Run `rm -rf public/images/maps src/gallery/images.gen.json && npm run build`. Expected: the sync runs as `prebuild`, the build succeeds, and `dist/images/maps/` holds 56 full images and 56 thumbnails.
- [ ] **Step 2:** Run `npm test`. Expected: all pass.
- [ ] **Step 3:** Run `git status`. Expected: no generated images or JSON are tracked.
