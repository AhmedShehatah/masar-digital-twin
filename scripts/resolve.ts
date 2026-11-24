/** Match the gallery catalog against the files found in Drive. Pure: no network, no disk. */
import type { Entry } from '../src/gallery/catalog.ts'
import { normalizeName, type DriveFile } from './drive.ts'

export interface Job { id: string; entry: string; year?: number; source: { drive: string } | { local: string } }

const IMAGE = /\.(jpe?g|png|webp|tiff?)$/i
const YEAR = /^\d{4}$/
const norm = (p: string) => p.split('/').map(normalizeName).filter(Boolean).join('/')
const byName = (a: DriveFile, b: DriveFile) => a.name.localeCompare(b.name)

export function resolveCatalog(entries: Entry[], files: DriveFile[]): { jobs: Job[]; errors: string[]; unused: string[] } {
  const images = files.filter((f) => IMAGE.test(f.name))
  const used = new Set<DriveFile>()
  const jobs: Job[] = []
  const errors: string[] = []
  const inFolder = (path: string) => images.filter((f) => f.path === path).sort(byName)
  const take = (f: DriveFile, job: Omit<Job, 'source'>) => { used.add(f); jobs.push({ ...job, source: { drive: f.id } }) }

  for (const e of entries) {
    if (e.from.startsWith('local:')) {
      jobs.push({ id: e.key, entry: e.key, source: { local: e.from.slice(6) } })
      continue
    }
    const from = norm(e.from)

    if (e.mode === 'single') {
      if (IMAGE.test(from)) {
        const cut = from.lastIndexOf('/')
        const name = from.slice(cut + 1)
        const found = inFolder(from.slice(0, Math.max(cut, 0))).filter((f) => f.name === name)
        if (found.length === 1) take(found[0], { id: e.key, entry: e.key })
        else if (!found.length) errors.push(`${e.key}: file not found in Drive: ${from}`)
        else errors.push(`${e.key}: found ${found.length} files named ${name} in Drive; delete the old copy`)
      } else {
        const found = inFolder(from)
        if (found.length === 1) take(found[0], { id: e.key, entry: e.key })
        else errors.push(`${e.key}: expected exactly one image in Drive folder "${from}", found ${found.length}`)
      }
    } else if (e.mode === 'years') {
      const years = new Map<number, DriveFile[]>()
      for (const f of images) {
        const rest = f.path.startsWith(`${from}/`) ? f.path.slice(from.length + 1) : null
        if (rest && YEAR.test(rest)) years.set(Number(rest), [...(years.get(Number(rest)) ?? []), f])
      }
      if (!years.size) errors.push(`${e.key}: no year folders with images under Drive folder "${from}"`)
      for (const [year, found] of [...years].sort((a, b) => a[0] - b[0])) {
        if (found.length === 1) take(found[0], { id: `${e.key}-${year}`, entry: e.key, year })
        else errors.push(`${e.key}: expected one image in "${from}/${year}", found ${found.length}`)
      }
    } else {
      const found = images.filter((f) => f.path === from || f.path.startsWith(`${from}/`))
        .sort((a, b) => a.path.localeCompare(b.path) || byName(a, b))
      if (!found.length) errors.push(`${e.key}: no images under Drive folder "${from}"`)
      const count = new Map<number | undefined, number>()
      for (const file of found) {
        const seg = file.path.split('/').reverse().find((s) => YEAR.test(s))
        const year = seg ? Number(seg) : undefined
        const k = (count.get(year) ?? 0) + 1
        count.set(year, k)
        take(file, { id: year ? `${e.key}-${year}-${k}` : `${e.key}-${k}`, entry: e.key, year })
      }
    }
  }

  const unused = images.filter((f) => !used.has(f)).map((f) => (f.path ? `${f.path}/${f.name}` : f.name))
  return { jobs, errors, unused }
}
