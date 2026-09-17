import { listSplashSlides, updateSplashSlideImage } from '../../db/queries/splash.queries.js';
import { deleteUploadedImage, saveUploadedImage, uploadedImagePathFromPublicUrl } from '../../lib/uploads.js';
import { processSplashImage } from '../../lib/image.js';
import { AppError } from '../../middleware/error-handler.middleware.js';

export async function getSplashSlides() {
  const slides = await listSplashSlides();
  return slides.map((s) => ({ slot: s.slot, imageUrl: s.imageUrl, updatedAt: s.updatedAt }));
}

/**
 * Replace one slide's photo. The bundled default images (seeded by the
 * migration) live outside uploads/ entirely, so uploadedImagePathFromPublicUrl
 * correctly returns null for them — the very first replacement of a slide
 * never tries to delete a file this app doesn't own.
 */
export async function replaceSplashSlideImage(slot: number, fileBuffer: Buffer, adminId: string) {
  const current = (await listSplashSlides()).find((s) => s.slot === slot);

  let processed;
  try {
    processed = await processSplashImage(fileBuffer);
  } catch {
    throw new AppError(400, 'The uploaded file is not a valid image.');
  }

  let stored;
  try {
    stored = await saveUploadedImage(processed, 'splash');
  } catch {
    throw new AppError(503, 'Splash image storage is unavailable or not configured');
  }

  try {
    const slide = await updateSplashSlideImage(slot, stored.publicUrl, adminId);
    const previousPath = uploadedImagePathFromPublicUrl(current?.imageUrl ?? null);
    if (previousPath) deleteUploadedImage(previousPath).catch(() => undefined);
    return {
      slide: { slot: slide.slot, imageUrl: slide.imageUrl, updatedAt: slide.updatedAt },
      image: { format: processed.format, width: processed.width, height: processed.height, bytes: processed.size },
    };
  } catch (error) {
    await deleteUploadedImage(stored.path).catch(() => undefined);
    throw error;
  }
}
