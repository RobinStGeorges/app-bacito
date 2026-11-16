// Faux 'famille-core' pour les tests : une session « prête » réglable, et appCollection
// branché sur la fausse base.
import { collection } from './firestore';

type S =
  | { status: 'loading' | 'signedOut' }
  | { status: 'ready'; user: { uid: string }; displayName: string; familyId: string; familyName: string; isOwner: boolean };

let current: S = { status: 'loading' };
const subs = new Set<(s: S) => void>();

export const session = {
  subscribe(run: (s: S) => void) {
    run(current);
    subs.add(run);
    return () => subs.delete(run);
  },
};

export function _setSession(s: S) {
  current = s;
  subs.forEach((f) => f(s));
}

export function initFamille() {
  return { db: {} };
}
export function initTheme() {}
export function getServices() {
  return { db: {} };
}
export async function signIn() {}
export function appCollection(familyId: string, appId: string, ...segments: string[]) {
  return collection({}, 'families', familyId, 'apps', appId, ...segments);
}
export function toFrenchMessage(e: unknown): string {
  return (e as { code?: string })?.code === 'permission-denied'
    ? "Vous n'avez pas l'autorisation d'effectuer cette action."
    : 'Une erreur est survenue. Réessayez dans un instant.';
}
