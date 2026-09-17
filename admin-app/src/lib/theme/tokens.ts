/**
 * Design System Tokens — Admin Dashboard.
 * Shares the same brand blue/navy identity as the mobile app, so the two
 * feel like one product from the same company rather than two different
 * tools. Components should import from here instead of hardcoding values.
 */

// ── Brand Colors ─────────────────────────────────────────
export const colors = {
  primary: '#0135C6',
  primaryDark: '#0129A3',
  primaryBg: '#DCE6FB',

  danger: '#DC2626',
  dangerBg: '#FEE2E2',

  warning: '#98620B',
  warningBg: '#FEF3C7',

  success: '#087451',
  successBg: '#D1FAE5',

  info: '#2563EB',
  infoBg: '#DBEAFE',

  bg: '#F4F6FA',
  cardBg: '#FFFFFF',
  border: '#E2E5EE',

  textPrimary: '#1A1D29',
  textSecondary: '#8A8FA3',
  textMuted: '#8A8FA3',

  sidebarBg: '#080E49',
  sidebarText: '#A9B3DD',
  sidebarActiveBg: '#151F59',
  sidebarActiveText: '#FFFFFF',
} as const;

// ── Status → Color Mapping ───────────────────────────────
export const statusColors = {
  active: { fg: colors.success, bg: colors.successBg },
  // Imported Contacts: a lead who has since become a real registered
  // account (green — converted, matches "active"'s tone deliberately) vs.
  // one who hasn't yet (neutral, same as "draft").
  registered: { fg: colors.success, bg: colors.successBg },
  lead: { fg: colors.textSecondary, bg: colors.border },
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

  // Integration live-reachability + log status (same page)
  reachable: { fg: colors.success, bg: colors.successBg },
  unreachable: { fg: colors.danger, bg: colors.dangerBg },
  not_applicable: { fg: colors.textSecondary, bg: colors.border },
  success: { fg: colors.success, bg: colors.successBg },
  error: { fg: colors.danger, bg: colors.dangerBg },
  delivered: { fg: colors.success, bg: colors.successBg },
  failed: { fg: colors.danger, bg: colors.dangerBg },
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
  card: 16,
  button: 11,
  pill: 999,
} as const;

// ── Typography ───────────────────────────────────────────
export const typography = {
  fontFamily: "'Hoover', 'Segoe UI', sans-serif",
} as const;
