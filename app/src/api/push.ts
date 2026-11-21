/**
 * Web Push im Browser (AP-8): Erlaubnis, Abo beim Push-Dienst, Abo beim Server.
 * Auf dem iPhone geht Push nur in der installierten App (zum Home-Bildschirm hinzugefügt).
 */
import { api } from './client';

export interface EventPref {
  event: string;
  label: string;
  enabled: boolean;
}

export interface NotificationSettings {
  devices: number;
  events: EventPref[];
}

export type PushState = 'unsupported' | 'ios-browser' | 'denied' | 'off' | 'on';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Der öffentliche Schlüssel kommt als base64url; der Browser will Bytes. */
export function urlBase64ToBytes(value: string): Uint8Array {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !standalone() ? 'ios-browser' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Erlaubnis holen, beim Push-Dienst abonnieren und das Abo beim Server speichern. */
export async function enablePush(): Promise<NotificationSettings> {
  const { key } = await api<{ key: string | null }>('/push/vapid-key');
  if (!key) throw new Error('Push ist auf dem Server noch nicht eingerichtet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) }));
  return api<NotificationSettings>('/push/subscriptions', { method: 'POST', body: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api(`/push/subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(
    () => undefined,
  );
  await sub.unsubscribe();
}
