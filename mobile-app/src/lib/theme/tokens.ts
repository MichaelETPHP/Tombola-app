/**
 * Design System Tokens — Single source of truth for all visual constants.
 * Components should import from here instead of hardcoding values.
 *
 * These map directly to the CSS custom properties in app.css,
 * and are exported for use in JavaScript/Svelte logic (e.g., canvas drawing,
 * dynamic styles, conditional theming).
 */

// ── Brand Colors ─────────────────────────────────────────
export const colors = {
  primary: '#00D3A0',
  primaryDark: '#00B589',

  coralStart: '#FF6B6B',
  coralEnd: '#FF8674',

  gold: '#F5A623',
  goldBg: '#FFF3D6',

  pink: '#FF5C7A',
  pinkBg: '#FFE1E6',
  pinkTrack: '#FFD9DF',

  blue: '#4A7FFF',
  blueBg: '#E3EEFF',
  blueTrack: '#DCE8FF',

  cardBg: '#FFFFFF',

  textPrimary: '#1A1D29',
  textSecondary: '#8A8FA3',

  navInactive: '#A6ABBD',
  navActiveBg: '#00D3A0',
  navActiveText: '#FFFFFF',

  dotInactive: '#D9DCE3',

  bgGradientStart: '#E3F9EF',
  bgGradientEnd: '#B9EEDA',

  actionIconBg: '#DFF7EE',
  actionIconColor: '#00C896',
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
  card: 24,
  button: 16,
  action: 20,
  nav: 32,
  iconCircle: 18, // half of 36px circle
  actionCircle: 22, // half of 44px circle
} as const;

// ── Shadows ──────────────────────────────────────────────
export const shadows = {
  card: '0 8px 20px rgba(0, 0, 0, 0.06)',
  cardLight: '0 4px 12px rgba(0, 0, 0, 0.04)',
  nav: '0 10px 24px rgba(0, 0, 0, 0.08)',
} as const;

// ── Typography ───────────────────────────────────────────
export const typography = {
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

  greetingSize: 22,
  greetingWeight: 700,
  greetingSalutationWeight: 400,

  statNumberSize: 30,
  statNumberWeight: 800,
  statNumberLetterSpacing: -0.5,

  cardLabelSize: 14,
  cardLabelWeight: 600,

  subLabelSize: 12,
  subLabelWeight: 400,

  gridLabelSize: 12,
  gridLabelWeight: 500,
} as const;

// ── Component Dimensions ─────────────────────────────────
export const dimensions = {
  avatarSize: 44,
  iconSize: 22,
  iconHitArea: 44,
  statIconCircle: 36,
  statIconSize: 18,
  actionIconCircle: 44,
  actionIconSize: 20,
  ctaHeight: 44,
  progressRingThickness: 6,
  navHeight: 64,
  bannerHeight: 120,
  dotActiveWidth: 18,
  dotInactiveSize: 6,
} as const;

// ── Stat Card Accent Mapping ─────────────────────────────
export const statCardAccents = {
  tickets: {
    iconBg: colors.primaryDark,
    iconColor: colors.cardBg,
    accentColor: colors.primary,
  },
  wins: {
    iconBg: colors.goldBg,
    iconColor: colors.gold,
    accentColor: colors.gold,
  },
  progress: {
    iconBg: colors.pinkBg,
    iconColor: colors.pink,
    accentColor: colors.pink,
    trackColor: colors.pinkTrack,
  },
  deadline: {
    iconBg: colors.blueBg,
    iconColor: colors.blue,
    accentColor: colors.blue,
    trackColor: colors.blueTrack,
  },
} as const;
