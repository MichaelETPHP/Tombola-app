const allowed: Record<string, readonly string[]> = {
  verified: ['id_submitted'],
  fulfilled: ['verified'],
  rejected: ['id_submitted', 'verified'],
};
export const canTransitionPayout = (from: string, to: string): boolean => allowed[to]?.includes(from) ?? false;
