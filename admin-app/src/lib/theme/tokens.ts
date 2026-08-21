/**
 * Design System Tokens — Admin Dashboard.
 * A calmer, professional palette distinct from the consumer mobile app —
 * this is a working tool, not a marketing surface. Components should
 * import from here instead of hardcoding values.
 */

// ── Brand Colors ─────────────────────────────────────────
export const colors = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryBg: '#EEF2FF',

  danger: '#DC2626',
  dangerBg: '#FEE2E2',

  warning: '#D97706',
  warningBg: '#FEF3C7',

  success: '#059669',
  successBg: '#D1FAE5',

  info: '#2563EB',
  infoBg: '#DBEAFE',

  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  border: '#E2E8F0',

  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',

  sidebarBg: '#0F172A',
  sidebarText: '#CBD5E1',
  sidebarActiveBg: '#1E293B',
  sidebarActiveText: '#FFFFFF',
} as const;

// ── Status → Color Mapping ───────────────────────────────
export const statusColors = {
  open: { fg: colors.success, bg: colors.successBg },
  locked: { fg: colors.warning, bg: colors.warningBg },
  drawing: { fg: colors.info, bg: colors.infoBg },
  completed: { fg: colors.textSecondary, bg: colors.border },
  cancelled: { fg: colors.danger, bg: colors.dangerBg },

  pending_claim: { fg: colors.warning, bg: colors.warningBg },
  claimed: { fg: colors.info, bg: colors.infoBg },
  verified: { fg: colors.primary, bg: colors.primaryBg },
  fulfilled: { fg: colors.success, bg: colors.successBg },
  expired: { fg: colors.danger, bg: colors.dangerBg },
  rejected: { fg: colors.danger, bg: colors.dangerBg },
} as const;

// ── Spacing Scale ────────────────────────────────────────
export const spacing = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
} as const;

// ── Corner Radii ─────────────────────────────────────────
export const radii = {
  card: 12,
  button: 8,
  pill: 999,
} as const;

// ── Typography ───────────────────────────────────────────
export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;
