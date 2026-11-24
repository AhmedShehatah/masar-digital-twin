import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCatalog } from './resolve.ts'
import type { Entry } from '../src/gallery/catalog.ts'
import type { DriveFile } from './drive.ts'

let n = 0
const f = (path: string, name: string): DriveFile => ({ id: `id${++n}-${name}`, path, name })
const entry = (e: Partial<Entry> & Pick<Entry, 'key' | 'mode' | 'from'>): Entry => ({ chapter: 'land', title: 't', desc: 'd', ...e })

test('single from a folder with one image', () => {
  const files = [f('خريطه جيولوجيا', 'g.jpg')]
  const r = resolveCatalog([entry({ key: 'geology', mode: 'single', from: 'خريطه جيولوجيا' })], files)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.jobs, [{ id: 'geology', entry: 'geology', source: { drive: files[0].id } }])
})

test('single from a folder with two images is an error naming the folder', () => {
  const r = resolveCatalog([entry({ key: 'geology', mode: 'single', from: 'خريطه جيولوجيا' })],
    [f('خريطه جيولوجيا', 'a.jpg'), f('خريطه جيولوجيا', 'b.jpg')])
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /خريطه جيولوجيا/)
})

test('single from a named file picks that file', () => {
  const files = [f('تحليل طبوغرافي', 'a.jpg'), f('تحليل طبوغرافي', 'b.jpg')]
  const r = resolveCatalog([entry({ key: 'slope', mode: 'single', from: 'تحليل طبوغرافي/b.jpg' })], files)
  assert.deepEqual(r.jobs.map((j) => j.source), [{ drive: files[1].id }])
  assert.deepEqual(r.unused, ['تحليل طبوغرافي/a.jpg'])
})

test('single from a missing file is an error', () => {
  const r = resolveCatalog([entry({ key: 'slope', mode: 'single', from: 'تحليل طبوغرافي/zz.jpg' })], [f('تحليل طبوغرافي', 'a.jpg')])
  assert.equal(r.errors.length, 1)
})

test('single from a file name that appears twice is an error', () => {
  const r = resolveCatalog([entry({ key: 'slope', mode: 'single', from: 'تحليل طبوغرافي/b.jpg' })],
    [f('تحليل طبوغرافي', 'b.jpg'), f('تحليل طبوغرافي', 'b.jpg')])
  assert.equal(r.jobs.length, 0)
  assert.match(r.errors[0], /found 2 files named b\.jpg/)
})

test('TIFF exports count as images', () => {
  const r = resolveCatalog([entry({ key: 'class', mode: 'years', from: 'تصنيف' })], [f('تصنيف/2016', 'map.tif')])
  assert.deepEqual(r.jobs.map((j) => j.id), ['class-2016'])
})

test('single from a local file', () => {
  const r = resolveCatalog([entry({ key: 'solar', mode: 'single', from: 'local:solar.jpg' })], [])
  assert.deepEqual(r.jobs, [{ id: 'solar', entry: 'solar', source: { local: 'solar.jpg' } }])
})

test('years skips empty year folders and orders frames by year', () => {
  const files = [f('تصنيف/2026', 'c.jpg'), f('تصنيف/2006', 'a.jpg')]
  const r = resolveCatalog([entry({ key: 'class', mode: 'years', from: 'تصنيف' })], files)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.jobs.map((j) => [j.id, j.year]), [['class-2006', 2006], ['class-2026', 2026]])
})

test('years with two images in one year is an error', () => {
  const r = resolveCatalog([entry({ key: 'class', mode: 'years', from: 'تصنيف' })],
    [f('تصنيف/2006', 'a.jpg'), f('تصنيف/2006', 'b.jpg')])
  assert.equal(r.errors.length, 1)
})

test('years with no year folders is an error', () => {
  const r = resolveCatalog([entry({ key: 'class', mode: 'years', from: 'تصنيف' })], [])
  assert.equal(r.errors.length, 1)
})

test('all numbers every image within its year', () => {
  const files = [f('3d/2026', '1.png'), f('3d/2016', 'b.jpg'), f('3d/2016', 'a.jpg')]
  const r = resolveCatalog([entry({ key: '3d', mode: 'all', from: '3d' })], files)
  assert.deepEqual(r.jobs.map((j) => [j.id, j.year]), [['3d-2016-1', 2016], ['3d-2016-2', 2016], ['3d-2026-1', 2026]])
})

test('all gives images outside a year folder no year', () => {
  const r = resolveCatalog([entry({ key: '3d', mode: 'all', from: '3d' })], [f('3d', 'loose.jpg')])
  assert.deepEqual(r.jobs.map((j) => [j.id, j.year]), [['3d-1', undefined]])
})

test('files that are not images are ignored entirely', () => {
  const files = [f('خريطه جيولوجيا', 'g.jpg'), f('خريطه جيولوجيا', 'g.kmz'), f('other', 'notes.pdf')]
  const r = resolveCatalog([entry({ key: 'geology', mode: 'single', from: 'خريطه جيولوجيا' })], files)
  assert.deepEqual(r.errors, [])
  assert.equal(r.jobs.length, 1)
  assert.deepEqual(r.unused, [])
})

test('images no entry uses are reported as unused', () => {
  const r = resolveCatalog([], [f('المناخ/الرطوبه', 'h.JPG')])
  assert.deepEqual(r.unused, ['المناخ/الرطوبه/h.JPG'])
})

test('entry paths match regardless of Unicode form and direction marks', () => {
  const r = resolveCatalog([entry({ key: 'soil', mode: 'single', from: 'خريطه التربه‏'.normalize('NFD') })],
    [f('خريطه التربه'.normalize('NFC'), 's.jpg')])
  assert.deepEqual(r.errors, [])
  assert.equal(r.jobs.length, 1)
})
