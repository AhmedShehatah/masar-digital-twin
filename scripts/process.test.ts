import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { processImage } from './process.ts'

const solid = (width: number, height: number, alpha = 1) =>
  sharp({ create: { width, height, channels: 4, background: { r: 30, g: 120, b: 60, alpha } } }).png().toBuffer()

test('caps the long side at 1600 and makes a 360-wide thumbnail', async () => {
  const r = await processImage(await solid(3000, 1000))
  assert.equal(r.w, 1600)
  assert.ok(r.h === 533 || r.h === 534)
  assert.deepEqual([...r.full.subarray(0, 2)], [0xff, 0xd8])
  assert.equal((await sharp(r.thumb).metadata()).width, 360)
  assert.match(r.hash, /^[0-9a-f]{8}$/)
})

test('never upscales a small image', async () => {
  const r = await processImage(await solid(800, 600))
  assert.deepEqual([r.w, r.h], [800, 600])
})

test('flattens transparency onto white', async () => {
  const r = await processImage(await solid(10, 10, 0))
  const { data } = await sharp(r.full).raw().toBuffer({ resolveWithObject: true })
  for (const c of data.subarray(0, 3)) assert.ok(c >= 252, `channel ${c} is not white`)
})

test('the same input gives the same hash', async () => {
  const input = await solid(400, 300)
  assert.equal((await processImage(input)).hash, (await processImage(input)).hash)
})
