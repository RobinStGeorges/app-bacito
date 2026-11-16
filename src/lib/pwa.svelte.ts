import { registerSW } from 'virtual:pwa-register';

// Bandeaux « Nouvelle version disponible » et « Hors connexion ».
export const pwa = $state({ needRefresh: false, online: typeof navigator === 'undefined' ? true : navigator.onLine });

let update: ((reload?: boolean) => Promise<void>) | null = null;

export function startPwa(): void {
  window.addEventListener('online', () => (pwa.online = true));
  window.addEventListener('offline', () => (pwa.online = false));
  if (import.meta.env.DEV) return;
  update = registerSW({
    onNeedRefresh() {
      pwa.needRefresh = true;
    },
  });
}

export function applyUpdate(): void {
  void update?.(true);
}
