/**
 * Pull the gallery maps from the public Google Drive folder, process them and write
 * public/images/maps/* plus src/gallery/images.gen.json. Runs before every build (npm run maps by hand).
 *
 *   --if-missing   do nothing when images.gen.json already exists (used by `npm run dev`)
 *   GOOGLE_API_KEY use the Drive API instead of the keyless folder page (for build servers Google blocks)
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { ENTRIES } from '../src/gallery/catalog.ts'
import { apiLister, download, keylessLister, walk } from './drive.ts'
import { processImage } from './process.ts'
import { resolveCatalog, type Job } from './resolve.ts'

const ROOT = '1aQjwLhdVegAGc_oI8IeuicxIHnLcZSWB'
const OUT = new URL('../public/images/maps/', import.meta.url)
const LOCAL = new URL('../assets/maps-local/', import.meta.url)
const GEN = new URL('../src/gallery/images.gen.json', import.meta.url)
const PARALLEL = 6
const RETRIES = 3

async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= RETRIES) throw new Error(`${what}: ${(e as Error).message}`)
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

async function main() {
  if (process.argv.includes('--if-missing') && existsSync(GEN)) return
  const key = process.env.GOOGLE_API_KEY || undefined
  console.log(`maps: reading Drive folder ${key ? 'with the Drive API' : 'without a key'}…`)

  const files = await withRetry('listing Drive', () => walk(key ? apiLister(key) : keylessLister, ROOT))
  const { jobs, errors, unused } = resolveCatalog(ENTRIES, files)
  for (const u of unused) console.warn(`warn: not in gallery: ${u}`)
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`)
    throw new Error(`${errors.length} gallery map(s) could not be matched to Drive; fix src/gallery/catalog.ts or the Drive folder`)
  }

  await rm(OUT, { recursive: true, force: true })
  await mkdir(new URL('thumb/', OUT), { recursive: true })

  const shots = await pool(jobs, PARALLEL, async (job: Job) => {
    const input = 'drive' in job.source
      ? await withRetry(`downloading ${job.id}`, () => download((job.source as { drive: string }).drive, key))
      : await readFile(new URL(job.source.local, LOCAL))
    const img = await processImage(input)
    const name = `${job.id}.${img.hash}.jpg`
    await writeFile(new URL(name, OUT), img.full)
    await writeFile(new URL(`thumb/${name}`, OUT), img.thumb)
    return { id: job.id, entry: job.entry, ...(job.year ? { year: job.year } : {}), src: `/images/maps/${name}`, thumb: `/images/maps/thumb/${name}`, w: img.w, h: img.h }
  })

  await writeFile(GEN, JSON.stringify({ generatedAt: new Date().toISOString(), shots }, null, 2) + '\n')
  const local = jobs.filter((j) => 'local' in j.source).length
  console.log(`synced ${shots.length} maps (${shots.length - local} from Drive, ${local} local)`)
}

main().catch((e) => {
  console.error(`maps: ${(e as Error).message}`)
  process.exit(1)
})
