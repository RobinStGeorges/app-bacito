// Décalage entre l'horloge du téléphone et celle du serveur Firestore, pour que le chrono
// se termine au même moment sur tous les téléphones même si l'un d'eux est mal réglé.
// Mesure : on écrit `lastSeen: serverTimestamp()` (battement de présence) et on compare
// l'heure posée par le serveur au milieu de l'aller-retour local.

let offsetMs = 0;
let pendingSentAt: number | null = null;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function getOffset(): number {
  return offsetMs;
}

/** À appeler juste avant d'envoyer une écriture `lastSeen: serverTimestamp()`. */
export function markSent(): void {
  pendingSentAt = Date.now();
}

/** À appeler quand le serveur a confirmé l'écriture (snapshot sans écriture en attente). */
export function onServerTime(serverMs: number | null): void {
  if (serverMs == null || pendingSentAt == null) return;
  const received = Date.now();
  const rtt = received - pendingSentAt;
  pendingSentAt = null;
  if (rtt < 0 || rtt > 5000) return; // mesure trop imprécise (réseau lent, reprise hors-ligne)
  offsetMs = Math.round(serverMs - (received - rtt / 2));
}

/** Pour les tests. */
export function _setOffset(ms: number): void {
  offsetMs = ms;
}
