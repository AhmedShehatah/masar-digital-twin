/** Read a public Google Drive folder: list it (with or without an API key) and download its files. */

export interface DriveItem { id: string; name: string; folder: boolean }
/** A file in the tree. `path` is its folder path from the root, segments joined with "/". */
export interface DriveFile { id: string; path: string; name: string }
export type Lister = (folderId: string) => Promise<DriveItem[]>

const API = 'https://www.googleapis.com/drive/v3/files'

/** Drive and macOS disagree on Unicode form, and Drive names can carry invisible direction marks. */
export function normalizeName(s: string): string {
  return s.replace(/[‎‏‪-‮]/g, '').normalize('NFC').trim()
}

const decode = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|#39|#\d+);/g, (_, e: string) =>
    e === 'amp' ? '&' : e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === '#39' ? "'" : String.fromCodePoint(Number(e.slice(1))))

/** Parse the HTML of drive.google.com/embeddedfolderview (an undocumented page, but it needs no key). */
export function parseFolderView(html: string): DriveItem[] {
  // even an empty folder has this container; without it Google sent a sign-in, consent or rate-limit page
  if (!html.includes('class="flip-entries"')) throw new Error('Drive sent a page that is not a Drive folder listing (blocked or rate-limited?)')
  const re = /href="https:\/\/drive\.google\.com\/(file\/d|drive\/folders)\/([\w-]+)[^"]*".*?flip-entry-title">(.*?)<\/div>/gs
  return [...html.matchAll(re)].map((m) => ({ id: m[2], name: decode(m[3]), folder: m[1] !== 'file/d' }))
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Drive request failed (${res.status}) for ${url.replace(/key=[^&]+/, 'key=…')}`)
  return res
}

export const keylessLister: Lister = async (id) =>
  parseFolderView(await (await get(`https://drive.google.com/embeddedfolderview?id=${id}`)).text())

export function apiLister(key: string): Lister {
  return async (id) => {
    const items: DriveItem[] = []
    let page = ''
    do {
      const q = encodeURIComponent(`'${id}' in parents and trashed=false`)
      const url = `${API}?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&key=${key}${page ? `&pageToken=${page}` : ''}`
      let body: { files: { id: string; name: string; mimeType: string }[]; nextPageToken?: string }
      try {
        body = await (await get(url)).json()
      } catch (e) {
        throw new Error(`Drive API listing failed (check GOOGLE_API_KEY): ${(e as Error).message}`)
      }
      for (const f of body.files) items.push({ id: f.id, name: f.name, folder: f.mimeType === 'application/vnd.google-apps.folder' })
      page = body.nextPageToken ?? ''
    } while (page)
    return items
  }
}

/** Every file under `rootId`, depth-first, sorted by name within each folder. */
export async function walk(list: Lister, rootId: string, path = ''): Promise<DriveFile[]> {
  const items = (await list(rootId)).map((i) => ({ ...i, name: normalizeName(i.name) }))
  items.sort((a, b) => a.name.localeCompare(b.name))
  const out: DriveFile[] = []
  for (const i of items) {
    if (i.folder) out.push(...(await walk(list, i.id, path ? `${path}/${i.name}` : i.name)))
    else out.push({ id: i.id, path, name: i.name })
  }
  return out
}

/** Download one file. Rejects when Drive answers with a page (virus scan, quota, block) instead of an image. */
export async function download(id: string, key?: string): Promise<Buffer> {
  const url = key ? `${API}/${id}?alt=media&key=${key}` : `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`
  const res = await get(url)
  const type = res.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`Drive returned ${type || 'no content type'}, not an image, for file ${id}`)
  return Buffer.from(await res.arrayBuffer())
}
