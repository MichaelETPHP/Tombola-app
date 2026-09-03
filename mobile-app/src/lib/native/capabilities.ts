import { Capacitor } from '@capacitor/core';
import { Camera, EncodingType, MediaTypeSelection } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Contacts } from '@capacitor-community/contacts';

export class NativeCapabilityError extends Error {
  constructor(
    public readonly capability: string,
    message: string
  ) {
    super(message);
    this.name = 'NativeCapabilityError';
  }
}

function ensureNative(capability: string): void {
  if (!Capacitor.isNativePlatform()) {
    throw new NativeCapabilityError(capability, `${capability} is available in the installed mobile app.`);
  }
}

function ensurePermission(capability: string, permission: string): void {
  if (permission !== 'granted' && permission !== 'limited') {
    throw new NativeCapabilityError(capability, `${capability} permission was not granted.`);
  }
}

/** Opens the native camera and returns a temporary URI for an optimized JPEG. */
export async function takeProfilePhoto() {
  const current = await Camera.checkPermissions();
  let permission = current.camera;
  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = (await Camera.requestPermissions({ permissions: ['camera'] })).camera;
  }
  ensurePermission('Camera', permission);

  return Camera.takePhoto({
    quality: 82,
    targetWidth: 1280,
    targetHeight: 1280,
    correctOrientation: true,
    encodingType: EncodingType.JPEG,
    saveToGallery: false,
    editable: 'no',
    webUseInput: true,
  });
}

/** Opens the system photo picker without reading the user's whole library. */
export async function choosePhotos(limit = 1) {
  return Camera.chooseFromGallery({
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: limit > 1,
    limit: Math.max(1, Math.min(limit, 5)),
    quality: 82,
    targetWidth: 1600,
    targetHeight: 1600,
    correctOrientation: true,
    webUseInput: true,
  });
}

/** Requests location only when a location-based feature is used. */
export async function getCurrentLocation(precise = false) {
  const alias = precise ? 'location' : 'coarseLocation';
  const current = await Geolocation.checkPermissions();
  let permission = current[alias];
  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = (await Geolocation.requestPermissions({ permissions: [alias] }))[alias];
  }
  ensurePermission('Location', permission);

  return Geolocation.getCurrentPosition({
    enableHighAccuracy: precise,
    timeout: 12_000,
    maximumAge: 60_000,
  });
}

export interface ShareYeneEtaOptions {
  title: string;
  text: string;
  url?: string;
  files?: string[];
}
export type ShareTombolaOptions = ShareYeneEtaOptions;

/** Uses the native share sheet and falls back to copying the link. */
export async function shareYeneEtaContent(options: ShareYeneEtaOptions): Promise<void> {
  const supported = await Share.canShare();
  if (supported.value) {
    await Share.share({ ...options, dialogTitle: 'Share from YeneEta' });
    return;
  }

  await Clipboard.write({ string: options.url || options.text });
  await showNativeToast('Link copied');
}
export const shareTombolaContent = shareYeneEtaContent;

/** Opens the native single-contact picker; no contact data is uploaded here. */
export async function pickInviteContact() {
  ensureNative('Contacts');
  const current = await Contacts.checkPermissions();
  let permission = current.contacts;
  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = (await Contacts.requestPermissions()).contacts;
  }
  ensurePermission('Contacts', permission);

  return Contacts.pickContact({
    projection: {
      name: true,
      phones: true,
      image: false,
      emails: false,
      birthday: false,
      note: false,
      organization: false,
      urls: false,
      postalAddresses: false,
    },
  });
}

export async function getDeviceSummary() {
  const [info, id, battery, languageCode] = await Promise.all([
    Device.getInfo(),
    Device.getId(),
    Device.getBatteryInfo(),
    Device.getLanguageCode(),
  ]);
  return { info, id: id.identifier, battery, languageCode: languageCode.value };
}

export async function savePreference<T>(key: string, value: T): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export async function readPreference<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    await Preferences.remove({ key });
    return null;
  }
}

export async function removePreference(key: string): Promise<void> {
  await Preferences.remove({ key });
}

/** Saves app-generated text such as a receipt into private app storage. */
export async function saveAppDocument(path: string, contents: string) {
  const safePath = path.replace(/[^a-zA-Z0-9._/-]/g, '-').replace(/^\/+/, '');
  if (!safePath) throw new NativeCapabilityError('Filesystem', 'A valid file name is required.');

  return Filesystem.writeFile({
    path: safePath,
    data: contents,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

export interface RaffleReminder {
  id: number;
  title: string;
  body: string;
  at: Date;
  raffleId?: string;
}

/** Schedules an inexact reminder to avoid requesting Android alarm privileges. */
export async function scheduleRaffleReminder(reminder: RaffleReminder): Promise<void> {
  ensureNative('Notifications');
  const current = await LocalNotifications.checkPermissions();
  let permission = current.display;
  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = (await LocalNotifications.requestPermissions()).display;
  }
  ensurePermission('Notifications', permission);

  await LocalNotifications.schedule({
    notifications: [
      {
        id: reminder.id,
        title: reminder.title,
        body: reminder.body,
        schedule: { at: reminder.at },
        extra: { raffleId: reminder.raffleId },
        isExactNotification: false,
        autoCancel: true,
      },
    ],
  });
}

export async function cancelRaffleReminder(id: number): Promise<void> {
  ensureNative('Notifications');
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

export async function copyText(value: string): Promise<void> {
  await Clipboard.write({ string: value });
}

export async function readCopiedText(): Promise<string> {
  return (await Clipboard.read()).value;
}

export async function showNativeToast(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Toast.show({ text, duration: 'short', position: 'bottom' });
  }
}
