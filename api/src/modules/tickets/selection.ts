import { z } from 'zod';

export const selectedNumbersSchema = z.array(z.number().int().positive().max(2147483647))
  .min(1).max(4).refine((numbers) => new Set(numbers).size === numbers.length, 'Choose each number only once');

export const availabilitySchema = z.object({
  start: z.coerce.number().int().positive().max(2147483547).default(1),
  // A wheel picker needs one continuous list so swipes never stop at an
  // artificial page boundary. 5,000 covers normal raffles while retaining
  // a firm server-side bound against oversized generate_series requests.
  limit: z.coerce.number().int().min(1).max(5000).default(60),
});

export function sameSelection(left: number[], right: number[]): boolean {
  return left.length === right.length && [...left].sort((a, b) => a - b).every((n, i) => n === [...right].sort((a, b) => a - b)[i]);
}
