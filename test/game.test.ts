import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  HARD_LETTERS,
  clampDuration,
  drawCategories,
  drawLetter,
  formatClock,
  initialOf,
  isJoinable,
  isStale,
  isValid,
  leaderboard,
  parseAnswers,
  parsePlayer,
  parseRoom,
  parseVote,
  playerOrder,
  remainingMs,
  roundScores,
  startsWithLetter,
  tally,
  type Vote,
} from '../src/lib/game';

function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('tirages', () => {
  it('tire 6 catégories distinctes', () => {
    const c = drawCategories(Math.random);
    expect(c).toHaveLength(6);
    expect(new Set(c).size).toBe(6);
    c.forEach((x) => expect(CATEGORIES).toContain(x));
  });

  it('reste valide même avec un générateur qui renvoie 0,9999', () => {
    const c = drawCategories(() => 0.99999);
    expect(new Set(c).size).toBe(6);
  });

  it('évite les lettres difficiles par défaut', () => {
    for (let k = 0; k < 200; k++) {
      expect(HARD_LETTERS).not.toContain(drawLetter(Math.random, [], false));
    }
  });

  it('peut tirer une lettre difficile si l’option est cochée', () => {
    expect(drawLetter(() => 0.9999, [], true)).toBe('Z');
  });

  it('évite les lettres déjà jouées, puis recommence quand tout est joué', () => {
    const used = 'ABCDEFGHIJLMNOPRSTUV'.split(''); // il ne reste que rien hors difficiles
    expect(drawLetter(seq(0), used, false)).toBe('A'); // tout épuisé → on recommence
    expect(drawLetter(seq(0), ['A'], false)).toBe('B');
  });

  it('borne la durée', () => {
    expect(clampDuration(10)).toBe(30);
    expect(clampDuration(1000)).toBe(300);
    expect(clampDuration(97)).toBe(90);
  });
});

describe('chrono', () => {
  it('calcule le temps restant', () => {
    expect(remainingMs(1000, 90, 1000)).toBe(90000);
    expect(remainingMs(1000, 90, 900)).toBe(90000); // horloge légèrement en retard
    expect(remainingMs(1000, 90, 61000)).toBe(30000);
    expect(remainingMs(1000, 90, 999999)).toBe(0);
    expect(remainingMs(null, 90, 5)).toBe(90000);
  });
  it('formate', () => {
    expect(formatClock(90000)).toBe('1:30');
    expect(formatClock(5001)).toBe('0:06');
    expect(formatClock(0)).toBe('0:00');
  });
});

describe('lettre initiale', () => {
  it('ignore accents, espaces et élisions', () => {
    expect(initialOf('  Éléphant')).toBe('E');
    expect(initialOf("l'Oréal")).toBe('L');
    expect(startsWithLetter('éclair', 'E')).toBe(true);
    expect(startsWithLetter('Banane', 'p')).toBe(false);
    expect(initialOf('   ')).toBe('');
  });
});

describe('jury', () => {
  const votes: Vote[] = [
    { round: 1, target: 'a', voter: 'b', values: [1, -1, 1, 0, -1, 0] },
    { round: 1, target: 'a', voter: 'c', values: [1, -1, -1, 0, -1, 1] },
    { round: 1, target: 'a', voter: 'a', values: [-1, -1, -1, -1, -1, -1] }, // auto-vote ignoré
    { round: 2, target: 'a', voter: 'b', values: [-1, -1, -1, -1, -1, -1] }, // autre manche ignorée
  ];

  it('compte les votes sans l’auto-vote', () => {
    expect(tally(votes, 1, 'a', 0)).toEqual({ up: 2, down: 0 });
    expect(tally(votes, 1, 'a', 2)).toEqual({ up: 1, down: 1 });
  });

  it('majorité ou égalité de 👍 = valide ; vide = invalide', () => {
    expect(isValid('Paris', { up: 1, down: 1 })).toBe(true);
    expect(isValid('Paris', { up: 0, down: 0 })).toBe(true);
    expect(isValid('Paris', { up: 1, down: 2 })).toBe(false);
    expect(isValid('   ', { up: 3, down: 0 })).toBe(false);
  });

  it('calcule les points de la manche', () => {
    const answers = [
      { uid: 'a', round: 1, values: ['Pomme', 'Pérou', 'Paris', '', 'Pie', 'Pilote'] },
      { uid: 'b', round: 1, values: ['Poire', '', '', '', '', ''] },
    ];
    // a : 0 ✔(2-0), 1 ✘(0-2), 2 ✔(1-1), 3 vide, 4 ✘(0-2), 5 ✔(1-0) → 3
    // b : aucun vote → seule la réponse non vide compte → 1 ; c : pas de réponses → 0
    expect(roundScores(1, ['a', 'b', 'c'], answers, votes)).toEqual({ a: 3, b: 1, c: 0 });
  });
});

describe('classement', () => {
  it('cumule les manches et gère les ex æquo', () => {
    const players = [
      parsePlayer('a', { name: 'Alice', scores: { '1': 3, '2': 2 } }),
      parsePlayer('b', { name: 'Bob', scores: { '1': 5 } }),
      parsePlayer('c', { name: 'Chloé', scores: { '1': 1, '2': 1 } }),
    ];
    const lb = leaderboard(players, 2);
    expect(lb.map((r) => [r.name, r.total, r.place, r.last])).toEqual([
      ['Alice', 5, 1, 2],
      ['Bob', 5, 1, 0],
      ['Chloé', 2, 3, 1],
    ]);
  });

  it('ordre de passage = ordre d’arrivée, sans les partis', () => {
    const players = [
      parsePlayer('z', { joinedAt: 30 }),
      parsePlayer('x', { joinedAt: 10 }),
      parsePlayer('y', { joinedAt: 20, left: true }),
      parsePlayer('w', {}), // écriture pas encore confirmée : en dernier
    ];
    expect(playerOrder(players)).toEqual(['x', 'z', 'w']);
  });
});

describe('lecture tolérante', () => {
  it('room vide ou abîmée → valeurs par défaut', () => {
    const r = parseRoom('r1', undefined);
    expect(r.status).toBe('closed');
    expect(r.durationSec).toBe(90);
    expect(r.categories).toEqual([]);
    const r2 = parseRoom('r2', { status: 'playing', round: '3', letter: 'pomme', startedAt: { toMillis: () => 42 } });
    expect(r2.round).toBe(0);
    expect(r2.letter).toBe('P');
    expect(r2.startedAtMs).toBe(42);
  });
  it('réponses et votes complétés à 6 cases', () => {
    expect(parseAnswers({ values: ['a', 3] }).values).toEqual(['a', '', '', '', '', '']);
    expect(parseVote({ v: { '0': 1, '2': -1, '3': 7 } }).values).toEqual([1, 0, -1, 0, 0, 0]);
  });
  it('scores non numériques ignorés', () => {
    expect(parsePlayer('a', { scores: { '1': 2, '2': 'x' } }).scores).toEqual({ '1': 2 });
  });
});

describe('présence et salles', () => {
  it('absent après 45 s', () => {
    const p = parsePlayer('a', { lastSeen: 1000 });
    expect(isStale(p, 30000)).toBe(false);
    expect(isStale(p, 47000)).toBe(true);
    expect(isStale(undefined, 0)).toBe(true);
  });
  it('salles rejoignables', () => {
    const now = 10 * 3600 * 1000;
    expect(isJoinable(parseRoom('a', { status: 'lobby', createdAt: now - 1000 }), now)).toBe(true);
    expect(isJoinable(parseRoom('a', { status: 'lobby', createdAt: now - 4 * 3600 * 1000 }), now)).toBe(false);
    expect(isJoinable(parseRoom('a', { status: 'playing' }), now)).toBe(false);
  });
});
