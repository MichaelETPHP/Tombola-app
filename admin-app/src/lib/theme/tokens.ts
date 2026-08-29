/**
 * Design System Tokens — Admin Dashboard.
 * A calmer, professional palette distinct from the consumer mobile app —
 * this is a working tool, not a marketing surface. Components should
 * import from here instead of hardcoding values.
 */

// ── Brand Colors ─────────────────────────────────────────
export const colors = {
  primary: '#159A7F',
  primaryDark: '#107C68',
  primaryBg: '#E2F5EF',

  danger: '#DC2626',
  dangerBg: '#FEE2E2',

  warning: '#D97706',
  warningBg: '#FEF3C7',

  success: '#059669',
  successBg: '#D1FAE5',

  info: '#2563EB',
  infoBg: '#DBEAFE',

  bg: '#F3F7F5',
  cardBg: '#FFFFFF',
  border: '#DDE7E3',

  textPrimary: '#17201E',
  textSecondary: '#66736F',
  textMuted: '#96A39F',

  sidebarBg: '#17201E',
  sidebarText: '#B8C5C1',
  sidebarActiveBg: '#24312E',
  sidebarActiveText: '#FFFFFF',
} as const;

// ── Status → Color Mapping ───────────────────────────────
export const statusColors = {
  active: { fg: colors.success, bg: colors.successBg },
  suspended: { fg: colors.danger, bg: colors.dangerBg },
  banned: { fg: colors.danger, bg: colors.dangerBg },
  draft: { fg: colors.textSecondary, bg: colors.border },
  open: { fg: colors.success, bg: colors.successBg },
  locked: { fg: colors.warning, bg: colors.warningBg },
  awaiting_trigger: { fg: colors.warning, bg: colors.warningBg },
  drawing: { fg: colors.info, bg: colors.infoBg },
  completed: { fg: colors.textSecondary, bg: colors.border },
  cancelled: { fg: colors.danger, bg: colors.dangerBg },

  pending_claim: { fg: colors.warning, bg: colors.warningBg },
  id_submitted: { fg: colors.info, bg: colors.infoBg },
  verified: { fg: colors.primary, bg: colors.primaryBg },
  fulfilled: { fg: colors.success, bg: colors.successBg },
  expired: { fg: colors.danger, bg: colors.dangerBg },
  rejected: { fg: colors.danger, bg: colors.dangerBg },

  // Integration status (admin-app /integrations page)
  mock: { fg: colors.warning, bg: colors.warningBg },
  live: { fg: colors.success, bg: colors.successBg },
  unconfigured: { fg: colors.danger, bg: colors.dangerBg },
  not_implemented: { fg: colors.textSecondary, bg: colors.border },
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
  card: 18,
  button: 11,
  pill: 999,
} as const;

// ── Typography ───────────────────────────────────────────
export const typography = {
  fontFamily: "'Outfit', 'Segoe UI', sans-serif",
} as const;
