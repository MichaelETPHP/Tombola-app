import { describe, expect, test } from 'bun:test';
import { availabilitySchema, selectedNumbersSchema } from '../src/modules/tickets/selection.js';

describe('ticket wheel selection contract', () => {
  test('loads a continuous raffle range while retaining a server bound', () => {
    expect(availabilitySchema.parse({ start: '1', limit: '5000' })).toEqual({ start: 1, limit: 5000 });
    expect(availabilitySchema.safeParse({ start: 1, limit: 5001 }).success).toBe(false);
  });

  test('keeps four unique ticket choices', () => {
    expect(selectedNumbersSchema.parse([1, 7, 42, 88])).toHaveLength(4);
    expect(selectedNumbersSchema.safeParse([1, 1]).success).toBe(false);
    expect(selectedNumbersSchema.safeParse([1, 2, 3, 4, 5]).success).toBe(false);
  });
});
