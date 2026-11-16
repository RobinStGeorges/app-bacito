// Test d'intégration : 3 joueurs (3 écrans montés en même temps) jouent deux manches complètes
// sur une fausse base Firestore partagée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('firebase/firestore', () => import('./fake/firestore'));
vi.mock('famille-core', () => import('./fake/famille-core'));

import * as fake from './fake/firestore';
import RoomView from '../src/lib/RoomView.svelte';
import { createRoom } from '../src/lib/firestore';
import { toasts } from '../src/lib/errors.svelte';

const FID = 'fam1';
type Screen = { el: HTMLElement; app: ReturnType<typeof mount>; uid: string };
let screens: Screen[] = [];

async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  flushSync();
}

function open(roomId: string, uid: string, name: string): Screen {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = mount(RoomView, { target: el, props: { familyId: FID, roomId, uid, name } });
  const s = { el, app, uid };
  screens.push(s);
  return s;
}

function button(s: Screen, text: string | RegExp): HTMLButtonElement {
  const b = [...s.el.querySelectorAll('button')].find((x) =>
    typeof text === 'string' ? x.textContent?.includes(text) : text.test(x.textContent ?? ''),
  );
  if (!b) throw new Error(`Bouton « ${text} » introuvable chez ${s.uid} :\n${s.el.textContent}`);
  return b as HTMLButtonElement;
}

function type(s: Screen, i: number, value: string) {
  const input = s.el.querySelector<HTMLInputElement>(`#bac-a${i}`)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function roomDoc(id: string) {
  return fake._dump()[`families/${FID}/apps/bacito/rooms/${id}`] as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] });
  fake._reset();
  fake._setDeny(false);
  location.hash = '';
});
afterEach(() => {
  screens.forEach((s) => {
    unmount(s.app);
    s.el.remove();
  });
  screens = [];
  vi.useRealTimers();
});

describe('une partie complète à 3', () => {
  it('salle d’attente → manche → jury → classement → rejouer', async () => {
    const rid = createRoom(FID, 'alice', 'Alice');
    const alice = open(rid, 'alice', 'Alice');
    await settle();
    const bob = open(rid, 'bob', 'Bob');
    await settle(10);
    const chloe = open(rid, 'chloe', 'Chloé');
    await settle(10);

    // Salle d'attente : tout le monde voit 3 joueurs ; seul l'hôte a « GO ! »
    for (const s of [alice, bob, chloe]) expect(s.el.textContent).toContain('Joueurs (3)');
    expect(() => button(bob, 'GO !')).toThrow();
    expect(bob.el.textContent).toContain('En attente de Alice');

    // L'hôte règle le chrono à 1:00 (−15 s deux fois), visible chez les autres
    button(alice, '−').click();
    await settle();
    button(alice, '−').click();
    await settle();
    expect(bob.el.textContent).toContain('1:00');

    button(alice, 'GO !').click();
    await settle();

    const r1 = roomDoc(rid);
    expect(r1.status).toBe('playing');
    expect(r1.round).toBe(1);
    const letter = r1.letter as string;
    expect(letter).toMatch(/^[A-Z]$/);
    expect(r1.categories as string[]).toHaveLength(6);
    expect(r1.judgeOrder).toEqual(['alice', 'bob', 'chloe']);
    for (const s of [alice, bob, chloe]) {
      expect(s.el.querySelectorAll('input.answer')).toHaveLength(6);
      expect(s.el.textContent).toContain('1:00');
    }

    // Saisie des copies
    type(alice, 0, `${letter}aaa`);
    type(alice, 1, `${letter}bbb`);
    type(alice, 2, 'faux');
    type(bob, 0, `${letter}ob`);
    // Chloé ne répond rien
    await settle(1000);

    // Fin du chrono : champs bloqués
    await settle(60_000);
    for (const s of [alice, bob, chloe]) {
      if (s.el.querySelector('input.answer:not([readonly])')) {
        expect(s.el.querySelector<HTMLInputElement>('#bac-a0')!.disabled).toBe(true);
      }
    }
    // Délai de grâce puis passage automatique au jury
    await settle(3000);
    expect(roomDoc(rid).status).toBe('judging');

    // Copie d'Alice : Alice ne peut pas voter, les autres oui
    expect(alice.el.textContent).toContain('Ta copie');
    expect(bob.el.textContent).toContain('Copie de Alice');
    const aliceThumbs = alice.el.querySelectorAll<HTMLButtonElement>('button.thumb');
    expect([...aliceThumbs].every((b) => b.disabled)).toBe(true);

    // Disposition : pouce rouge à gauche, réponse, pouce vert à droite
    const line = bob.el.querySelector('.judge')!;
    expect([...line.children].map((c) => c.className.split(' ').slice(0, 2).join(' '))).toEqual([
      'thumb down',
      'fc-input answer',
      'thumb up',
    ]);

    const thumbs = (s: Screen, row: number) => {
      const j = s.el.querySelectorAll('.judge')[row];
      return { down: j.querySelector<HTMLButtonElement>('.down')!, up: j.querySelector<HTMLButtonElement>('.up')! };
    };
    // ligne 0 : Bob 👍, Chloé 👍 → valide ; ligne 1 : Bob 👍, Chloé 👎 → égalité → valide ;
    // ligne 2 « faux » : Bob 👎, Chloé 👎 → refusé ; lignes vides : boutons désactivés
    thumbs(bob, 0).up.click();
    thumbs(chloe, 0).up.click();
    thumbs(bob, 1).up.click();
    thumbs(chloe, 1).down.click();
    thumbs(bob, 2).down.click();
    thumbs(chloe, 2).down.click();
    expect(thumbs(bob, 3).up.disabled).toBe(true);
    await settle();
    // changer d'avis : re-cliquer annule, puis on revote
    thumbs(chloe, 2).down.click();
    await settle();
    expect(thumbs(alice, 2).down.textContent).toContain('1');
    thumbs(chloe, 2).down.click();
    await settle();

    expect(alice.el.textContent).toContain('2 points pour toi');
    expect(alice.el.textContent).toContain('2 / 2 jurés ont voté');
    expect(alice.el.textContent).toContain(`Ne commence pas par ${letter}`);

    button(alice, 'Copie suivante').click();
    await settle();
    // Copie de Bob : 1 réponse, personne ne vote → égalité 0-0 → valide
    expect(bob.el.textContent).toContain('Ta copie');
    button(alice, 'Copie suivante').click();
    await settle();
    // Copie de Chloé : vide → 0 point
    expect(alice.el.textContent).toContain('0 point pour Chloé');
    expect(button(alice, 'Voir le classement')).toBeTruthy();
    button(alice, 'Voir le classement').click();
    await settle();

    expect(roomDoc(rid).status).toBe('results');
    const rows = () => [...bob.el.querySelectorAll('.board li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows()).toEqual(['🥇 Alice 2 (+2)', '🥈 Bob 1 (+1)', '🥉 Chloé 0 (+0)']);
    expect(() => button(bob, 'Rejouer')).toThrow();

    // Rejouer : mêmes joueurs, nouvelle lettre, points cumulés
    button(alice, 'Rejouer').click();
    await settle();
    const r2 = roomDoc(rid);
    expect(r2.round).toBe(2);
    expect(r2.status).toBe('playing');
    expect(r2.letter).not.toBe(letter);
    expect(r2.usedLetters).toEqual([letter, r2.letter]);
    for (const s of [alice, bob, chloe]) expect(s.el.querySelector<HTMLInputElement>('#bac-a0')!.value).toBe('');

    type(chloe, 0, `${r2.letter}x`);
    type(chloe, 1, `${r2.letter}y`);
    type(chloe, 2, `${r2.letter}z`);
    await settle(65_000);
    expect(roomDoc(rid).status).toBe('judging');
    for (let k = 0; k < 3; k++) {
      button(alice, /Copie suivante|Voir le classement/).click();
      await settle();
    }
    expect(rows()).toEqual(['🥇 Chloé 3 (+3)', '🥈 Alice 2 (+0)', '🥉 Bob 1 (+0)']);
  });

  it('un joueur arrivé après le GO ne peut pas entrer', async () => {
    const rid = createRoom(FID, 'alice', 'Alice');
    const alice = open(rid, 'alice', 'Alice');
    await settle();
    button(alice, 'GO !').click();
    await settle();
    const late = open(rid, 'dan', 'Dan');
    await settle();
    expect(late.el.textContent).toContain('déjà commencé sans toi');
  });

  it('si l’hôte ne répond plus, un autre joueur peut prendre la main', async () => {
    const rid = createRoom(FID, 'alice', 'Alice');
    const alice = open(rid, 'alice', 'Alice');
    await settle();
    const bob = open(rid, 'bob', 'Bob');
    await settle();
    unmount(alice.app); // téléphone d'Alice en veille : plus de battement
    alice.el.remove();
    screens = screens.filter((s) => s !== alice);
    await settle(50_000);
    button(bob, 'Prendre la main').click();
    await settle();
    expect(roomDoc(rid).hostUid).toBe('bob');
    expect(button(bob, 'GO !')).toBeTruthy();
  });

  it('l’hôte qui quitte la salle d’attente passe la main', async () => {
    const rid = createRoom(FID, 'alice', 'Alice');
    const alice = open(rid, 'alice', 'Alice');
    await settle();
    const bob = open(rid, 'bob', 'Bob');
    await settle(10);
    button(alice, 'Quitter').click();
    await settle();
    expect(roomDoc(rid).hostUid).toBe('bob');
    expect(bob.el.textContent).toContain('Joueurs (1)');
  });

  it('un refus du serveur est signalé par un message', async () => {
    const rid = createRoom(FID, 'alice', 'Alice');
    const alice = open(rid, 'alice', 'Alice');
    await settle();
    fake._setDeny(true);
    button(alice, 'GO !').click();
    await settle();
    expect(toasts.map((t) => t.text)).toContain("Vous n'avez pas l'autorisation d'effectuer cette action.");
  });
});
