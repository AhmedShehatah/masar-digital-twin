import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { download, normalizeName, parseFolderView, walk, type DriveItem, type Lister } from './drive.ts'

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')

test('parseFolderView reads files from a folder page', () => {
  const items = parseFolderView(fixture('folder-files.html'))
  assert.equal(items.length, 3)
  assert.ok(items.every((i) => !i.folder))
  assert.deepEqual(items.map((i) => i.id).sort(), [
    '1C0qN9-Ei4FxBeBYq7A-7mEwUft5tl975',
    '1cHKiCEGJ4WSjjM1MApASUHXtzsyAGh-U',
    '1sAqzBgwpev0uRqlBWd0bA5pYmH2s2NCT',
  ].sort())
  assert.equal(items.find((i) => i.id === '1cHKiCEGJ4WSjjM1MApASUHXtzsyAGh-U')?.name, '5769252582164468398.jpg')
})

test('parseFolderView reads subfolders', () => {
  const items = parseFolderView(fixture('folder-folders.html'))
  assert.deepEqual(items.map((i) => i.name).sort(), ['CCI', 'NDVI', 'SAVI'])
  assert.ok(items.every((i) => i.folder))
})

test('parseFolderView returns nothing for an empty folder', () => {
  assert.deepEqual(parseFolderView('<html><body></body></html>'), [])
})

test('parseFolderView decodes HTML entities in names', () => {
  const html = '<div class="flip-entry"><a href="https://drive.google.com/file/d/abc123/view"><div class="flip-entry-title">a &amp; b&#39;s</div></a></div>'
  assert.deepEqual(parseFolderView(html), [{ id: 'abc123', name: "a & b's", folder: false }])
})

test('normalizeName strips direction marks and unifies Unicode form', () => {
  assert.equal(normalizeName('Final layout‏'), 'Final layout')
  assert.equal(normalizeName('خريطه'.normalize('NFD')), 'خريطه'.normalize('NFC'))
})

test('walk lists every file depth-first with its folder path', async () => {
  const tree: Record<string, DriveItem[]> = {
    root: [{ id: 'f1', name: 'مؤشرات', folder: true }, { id: 'x', name: 'x.jpg', folder: false }],
    f1: [{ id: 'f2', name: 'NDVI', folder: true }],
    f2: [{ id: 'f3', name: '2006', folder: true }],
    f3: [{ id: 'a', name: 'a.jpg', folder: false }],
  }
  const list: Lister = async (id) => tree[id] ?? []
  const files = await walk(list, 'root')
  assert.deepEqual(files.map(({ path, name }) => ({ path, name })), [
    { path: '', name: 'x.jpg' },
    { path: 'مؤشرات/NDVI/2006', name: 'a.jpg' },
  ])
})

test('download rejects an HTML page served instead of the image', async () => {
  const real = globalThis.fetch
  globalThis.fetch = async () => new Response('<html>quota</html>', { status: 200, headers: { 'content-type': 'text/html' } })
  try {
    await assert.rejects(download('abc'), /not an image/)
  } finally {
    globalThis.fetch = real
  }
})
