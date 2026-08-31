import { createAvatar } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';

/**
 * A phone/OTP account has no profile photo at all (unlike Telegram
 * accounts, which carry one) — this generates a cartoon avatar instead of
 * plain initials. Deterministic: the same seed (the user's own id) always
 * produces the same avatar, so it stays stable across sessions without
 * needing to store anything.
 */
export function dicebearAvatarUri(seed: string): string {
  return createAvatar(avataaars, { seed }).toDataUri();
}
