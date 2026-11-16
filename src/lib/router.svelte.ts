// Navigation par #/… (le routeur du portail ne voit que /bacito/, le reste reste dans le navigateur).
export type Route = { name: 'menu' } | { name: 'join' } | { name: 'room'; id: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'rejoindre') return { name: 'join' };
  if (a === 'partie' && b && /^[A-Za-z0-9]{1,40}$/.test(b)) return { name: 'room', id: b };
  return { name: 'menu' };
}

export const route = $state<{ current: Route }>({ current: parseHash(location.hash) });

window.addEventListener('hashchange', () => {
  route.current = parseHash(location.hash);
});

export function go(path: string): void {
  location.hash = path;
}

// Dernière partie ouverte, pour proposer « Reprendre » au menu (confort, peut être vide).
const LAST = 'bacito.lastRoom';
export function rememberRoom(fid: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST, JSON.stringify({ fid, id }));
    else localStorage.removeItem(LAST);
  } catch {
    /* stockage indisponible */
  }
}
export function lastRoom(fid: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? 'null') as { fid?: string; id?: string } | null;
    return v && v.fid === fid && typeof v.id === 'string' ? v.id : null;
  } catch {
    return null;
  }
}
