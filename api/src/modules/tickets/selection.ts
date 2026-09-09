import { z } from 'zod';

export const selectedNumbersSchema = z.array(z.number().int().positive().max(2147483647))
  .min(1).max(5).refine((numbers) => new Set(numbers).size === numbers.length, 'Choose each number only once');

export const availabilitySchema = z.object({
  start: z.coerce.number().int().positive().max(2147483547).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

export function sameSelection(left: number[], right: number[]): boolean {
  return left.length === right.length && [...left].sort((a, b) => a - b).every((n, i) => n === [...right].sort((a, b) => a - b)[i]);
}
