/**
 * A phone/OTP account has no profile photo at all (unlike Telegram
 * accounts, which carry one) — this generates a cartoon avatar instead of
 * plain initials. Deterministic: the same seed (the user's own id) always
 * produces the same avatar, so it stays stable across sessions without
 * needing to store anything.
 *
 * @dicebear/core + @dicebear/avataaars together are the single largest
 * dependency in this app's client bundle (~130KB raw) for something that
 * only ever renders a small circular icon. Dynamically importing them here
 * — instead of the static top-level import this used to be — means that
 * weight only downloads the first time an avatar actually needs to render,
 * as its own lazy chunk, instead of sitting in the critical path of every
 * page that might show one (home, profile, chat). Cached after the first
 * call so a busy chat thread with many messages only pays the import cost
 * once.
 */
let dicebearModule: Promise<{
  createAvatar: (typeof import('@dicebear/core'))['createAvatar'];
  avataaars: typeof import('@dicebear/avataaars');
}> | undefined;

export async function dicebearAvatarUri(seed: string): Promise<string> {
  if (!dicebearModule) {
    dicebearModule = Promise.all([import('@dicebear/core'), import('@dicebear/avataaars')]).then(
      ([core, avataaars]) => ({ createAvatar: core.createAvatar, avataaars })
    );
  }
  const { createAvatar, avataaars } = await dicebearModule;
  return createAvatar(avataaars, { seed }).toDataUri();
}
