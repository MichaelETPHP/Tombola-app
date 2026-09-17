import { sql } from '../client.js';

export interface DbSplashSlide {
  slot: number;
  imageUrl: string;
  updatedAt: Date;
  updatedBy: string | null;
}

export async function listSplashSlides(): Promise<DbSplashSlide[]> {
  return sql<DbSplashSlide[]>`SELECT * FROM splash_slides ORDER BY slot`;
}

export async function updateSplashSlideImage(slot: number, imageUrl: string, adminId: string): Promise<DbSplashSlide> {
  const [slide] = await sql<DbSplashSlide[]>`
    INSERT INTO splash_slides (slot, image_url, updated_by)
    VALUES (${slot}, ${imageUrl}, ${adminId})
    ON CONFLICT (slot) DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = NOW(), updated_by = EXCLUDED.updated_by
    RETURNING *
  `;
  return slide;
}
