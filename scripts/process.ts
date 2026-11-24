/** Turn a downloaded map into the web image and thumbnail the gallery serves. */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

export async function processImage(input: Buffer): Promise<{ full: Buffer; thumb: Buffer; w: number; h: number; hash: string }> {
  const { data: full, info } = await sharp(input)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  const thumb = await sharp(full).resize({ width: 360 }).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toBuffer()
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 8)
  return { full, thumb, w: info.width, h: info.height, hash }
}
