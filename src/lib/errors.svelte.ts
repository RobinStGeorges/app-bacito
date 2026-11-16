import { toFrenchMessage } from 'famille-core';

// Messages d'erreur affichés en bas de l'écran (refus du serveur, etc.).
export const toasts = $state<{ id: number; text: string }[]>([]);
let next = 1;

export function report(e: unknown): void {
  console.error('[bacito]', e);
  const text = toFrenchMessage(e);
  if (toasts.some((t) => t.text === text)) return;
  const id = next++;
  toasts.push({ id, text });
  setTimeout(() => dismiss(id), 6000);
}

export function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
