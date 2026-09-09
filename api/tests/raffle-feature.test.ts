import { describe, expect, test } from 'bun:test';
import { createRaffleSchema, updateRaffleSchema, listRafflesSchema } from '../src/modules/raffles/raffles.schema.js';

const base = { title: 'Test raffle', prizeName: 'Headphones', prizeValue: 1000, categoryCode: 'TST', ticketPrice: 20, ticketCap: 150, maxTicketsPerUser: 4, deadlineDays: 30 };

describe('Raffle merchandising', () => {
  test('featuring is opt-in and can be removed', () => {
    expect(createRaffleSchema.parse(base).isFeatured).toBe(false);
    expect(createRaffleSchema.parse({ ...base, isFeatured: true }).isFeatured).toBe(true);
    expect(updateRaffleSchema.parse({ isFeatured: false })).toEqual({ isFeatured: false });
    expect(updateRaffleSchema.safeParse({ isFeatured: 'true' }).success).toBe(false);
  });
  test('query booleans distinguish false from true', () => {
    expect(listRafflesSchema.parse({ featured: 'false' }).featured).toBe(false);
    expect(listRafflesSchema.parse({ featured: 'true' }).featured).toBe(true);
    expect(listRafflesSchema.parse({}).featured).toBeUndefined();
  });
  test('one through three prizes are valid; four are rejected', () => {
    const extra = { name: 'Voucher', value: 100 };
    for (const count of [0, 1, 2]) {
      expect(createRaffleSchema.safeParse({ ...base, additionalPrizes: Array(count).fill(extra) }).success).toBe(true);
    }
    expect(createRaffleSchema.safeParse({ ...base, additionalPrizes: Array(3).fill(extra) }).success).toBe(false);
    expect(createRaffleSchema.safeParse({ ...base, prizeName: '' }).success).toBe(false);
    expect(createRaffleSchema.safeParse({ ...base, ticketCap: 50, additionalPrizes: [extra] }).success).toBe(false);
  });
});
