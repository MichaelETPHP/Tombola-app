import sharp from 'sharp';

export interface ImageProcessOptions {
  /** Maximum width in pixels (default: 1200) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 1200) */
  maxHeight?: number;
  /** WebP quality 1-100 (default: 80) */
  quality?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
  format: 'webp';
}

/**
 * Compress and convert an uploaded image to WebP format.
 * Resizes to fit within maxWidth/maxHeight while maintaining aspect ratio.
 */
export async function processImage(
  input: Buffer | Uint8Array,
  options: ImageProcessOptions = {}
): Promise<ProcessedImage> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 80 } = options;

  const processed = sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 5, smartSubsample: true });

  const buffer = await processed.toBuffer();
  const metadata = await sharp(buffer).metadata();

  return {
    buffer,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    size: buffer.length,
    format: 'webp',
  };
}

/**
 * Process a prize image — resized for display in the app.
 */
export async function processPrizeImage(input: Buffer | Uint8Array): Promise<ProcessedImage> {
  return processImage(input, {
    maxWidth: 1200,
    maxHeight: 900,
    quality: 82,
  });
}

/**
 * Process an ID document image — higher quality for verification.
 */
export async function processIdDocument(input: Buffer | Uint8Array): Promise<ProcessedImage> {
  return processImage(input, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 90,
  });
}
