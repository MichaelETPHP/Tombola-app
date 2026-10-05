import { describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { processIdDocument, processPrizeImage } from '../src/lib/image.js';

describe('patched native image upload pipeline', () => {
  test('decodes a real upload, bounds dimensions and emits WebP', async () => {
    const image = await sharp({ create: { width: 2000, height: 1800, channels: 3, background: '#abcdef' } }).jpeg().toBuffer();
    for (const process of [processIdDocument, processPrizeImage]) {
      const result = await process(image);
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe('webp');
      expect(result.width).toBeLessThanOrEqual(1600);
      expect(result.height).toBeLessThanOrEqual(1600);
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });
  test('non-image bytes are rejected', async () => {
    await expect(processIdDocument(Buffer.from('<script>not an image</script>'))).rejects.toThrow();
  });
});
