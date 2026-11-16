// Logique pure du Petit Bac : aucune dépendance à Firebase ni à Svelte.
// Les objets reçus ne doivent pas être des proxys Svelte ($state.raw côté composants).

export const CATEGORY_COUNT = 6;
export const DEFAULT_DURATION_SEC = 90;
export const MIN_DURATION_SEC = 30;
export const MAX_DURATION_SEC = 300;
export const DURATION_STEP_SEC = 15;

/** Lettres rarement jouables : exclues par défaut (option dans la salle d'attente). */
export const HARD_LETTERS = ['K', 'Q', 'W', 'X', 'Y', 'Z'];
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const CATEGORIES: readonly string[] = [
  'Prénom',
  'Pays',
  'Ville',
  'Animal',
  'Fruit ou légume',
  'Métier',
  'Objet',
  'Couleur',
  'Marque',
  'Sport',
  'Célébrité',
  'Personnage de fiction',
  'Film ou série',
  'Plat ou recette',
  'Boisson',
  'Instrument de musique',
  'Partie du corps',
  'Vêtement',
  'Moyen de transport',
  'Fleur ou plante',
  'Chanteur ou groupe',
  'Mot anglais',
  'Verbe',
  'Adjectif',
  'Insulte gentille',
  'Dans la cuisine',
  'Dans une trousse',
  'À la plage',
  'Super-pouvoir',
  'Excuse pour être en retard',
  'Chose qui pique',
  'Chose ronde',
  'Jeu ou jouet',
  'Matière scolaire ou mot d’école',
  'Fromage',
  'Dessert',
  'Langue',
  'Cadeau nul',
  'Monument ou lieu célèbre',
  'Maladie ou bobo',
];

export type RoomStatus = 'lobby' | 'playing' | 'judging' | 'results' | 'closed';

export interface Room {
  id: string;
  hostUid: string;
  hostName: string;
  status: RoomStatus;
  durationSec: number;
  hardLetters: boolean;
  round: number;
  letter: string;
  categories: string[];
  usedLetters: string[];
  /** Début de la manche (heure serveur, ms) ; null tant que le serveur n'a pas confirmé. */
  startedAtMs: number | null;
  judgeOrder: string[];
  judgeIndex: number;
  createdAtMs: number | null;
}

export interface Player {
  uid: string;
  name: string;
  joinedAtMs: number | null;
  lastSeenMs: number | null;
  left: boolean;
  /** Points par manche : { "1": 4, "2": 3 }. Idempotent (pas de compteur qui dérive). */
  scores: Record<string, number>;
}

export interface Answers {
  uid: string;
  round: number;
  values: string[];
}

/** Vote d'un juré sur les réponses d'un joueur : 1 = 👍, -1 = 👎, 0 = rien. */
export interface Vote {
  round: number;
  target: string;
  voter: string;
  values: number[];
}

// ---------- Lecture tolérante ----------

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : [];
}
/** Accepte un Timestamp Firestore, une Date, un nombre ; sinon null. */
export function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  return null;
}

const STATUSES: RoomStatus[] = ['lobby', 'playing', 'judging', 'results', 'closed'];

export function parseRoom(id: string, d: Record<string, unknown> | undefined): Room {
  const data = d ?? {};
  const status = STATUSES.includes(data.status as RoomStatus) ? (data.status as RoomStatus) : 'closed';
  return {
    id,
    hostUid: str(data.hostUid),
    hostName: str(data.hostName, 'Quelqu’un'),
    status,
    durationSec: clampDuration(num(data.durationSec, DEFAULT_DURATION_SEC)),
    hardLetters: data.hardLetters === true,
    round: Math.max(0, Math.floor(num(data.round, 0))),
    letter: str(data.letter).slice(0, 1).toUpperCase(),
    categories: strArray(data.categories),
    usedLetters: strArray(data.usedLetters),
    startedAtMs: toMillis(data.startedAt),
    judgeOrder: strArray(data.judgeOrder),
    judgeIndex: Math.max(0, Math.floor(num(data.judgeIndex, 0))),
    createdAtMs: toMillis(data.createdAt),
  };
}

export function parsePlayer(uid: string, d: Record<string, unknown> | undefined): Player {
  const data = d ?? {};
  const scores: Record<string, number> = {};
  const raw = data.scores;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) scores[k] = v;
    }
  }
  return {
    uid,
    name: str(data.name, 'Joueur'),
    joinedAtMs: toMillis(data.joinedAt),
    lastSeenMs: toMillis(data.lastSeen),
    left: data.left === true,
    scores,
  };
}

export function parseAnswers(d: Record<string, unknown> | undefined): Answers {
  const data = d ?? {};
  return { uid: str(data.uid), round: num(data.round), values: padValues(strArray(data.values)) };
}

export function parseVote(d: Record<string, unknown> | undefined): Vote {
  const data = d ?? {};
  const values: number[] = [];
  const raw = (data.v ?? {}) as Record<string, unknown>;
  for (let i = 0; i < CATEGORY_COUNT; i++) {
    const x = raw[String(i)];
    values.push(x === 1 ? 1 : x === -1 ? -1 : 0);
  }
  return { round: num(data.round), target: str(data.target), voter: str(data.voter), values };
}

function padValues(v: string[]): string[] {
  const out = v.slice(0, CATEGORY_COUNT);
  while (out.length < CATEGORY_COUNT) out.push('');
  return out;
}

// ---------- Identifiants de documents (un document par élément) ----------

export const answersId = (round: number, uid: string) => `${round}_${uid}`;
export const voteId = (round: number, target: string, voter: string) => `${round}_${target}_${voter}`;

// ---------- Tirages ----------

export type Rng = () => number;

export function clampDuration(sec: number): number {
  const s = Math.round(sec / DURATION_STEP_SEC) * DURATION_STEP_SEC;
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, s));
}

/** Tire une lettre, en évitant celles déjà jouées dans la partie (tant qu'il en reste). */
export function drawLetter(rng: Rng, used: readonly string[], hardLetters: boolean): string {
  const pool = ALPHABET.filter((l) => hardLetters || !HARD_LETTERS.includes(l));
  const fresh = pool.filter((l) => !used.includes(l));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(rng() * from.length) % from.length];
}

/** Tire n catégories distinctes (mélange de Fisher-Yates partiel). */
export function drawCategories(rng: Rng, n = CATEGORY_COUNT, pool: readonly string[] = CATEGORIES): string[] {
  const arr = pool.slice();
  const count = Math.min(n, arr.length);
  for (let i = 0; i < count; i++) {
    const j = i + (Math.floor(rng() * (arr.length - i)) % (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// ---------- Chrono ----------

export function remainingMs(startedAtMs: number | null, durationSec: number, nowServerMs: number): number {
  if (startedAtMs == null) return durationSec * 1000;
  // borné à la durée : un léger décalage d'horloge ne doit pas afficher « 1:31 » au départ
  return Math.min(durationSec * 1000, Math.max(0, startedAtMs + durationSec * 1000 - nowServerMs));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Jury et points ----------

/** Lettre initiale sans accent ni article d'élision : « Éléphant » → E, « L'Oréal » → L. */
export function initialOf(answer: string): string {
  const t = answer.trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = t.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : '';
}

export function startsWithLetter(answer: string, letter: string): boolean {
  return initialOf(answer) === letter.toUpperCase();
}

export interface Tally {
  up: number;
  down: number;
}

/** Décompte des votes pour la catégorie i des réponses de `target` (le joueur jugé ne vote pas). */
export function tally(votes: readonly Vote[], round: number, target: string, i: number): Tally {
  let up = 0;
  let down = 0;
  for (const v of votes) {
    if (v.round !== round || v.target !== target || v.voter === target) continue;
    if (v.values[i] === 1) up++;
    else if (v.values[i] === -1) down++;
  }
  return { up, down };
}

/** Règle : réponse non vide ET au moins autant de 👍 que de 👎 (égalité = valide). */
export function isValid(answer: string, t: Tally): boolean {
  return answer.trim() !== '' && t.up >= t.down;
}

/** Points de la manche pour chaque joueur jugé. */
export function roundScores(
  round: number,
  targets: readonly string[],
  answers: readonly Answers[],
  votes: readonly Vote[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const uid of targets) {
    const a = answers.find((x) => x.round === round && x.uid === uid);
    let pts = 0;
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      const val = a?.values[i] ?? '';
      if (isValid(val, tally(votes, round, uid, i))) pts++;
    }
    out[uid] = pts;
  }
  return out;
}

export function totalScore(p: Player): number {
  return Object.values(p.scores).reduce((s, n) => s + n, 0);
}

export interface Rank {
  uid: string;
  name: string;
  total: number;
  last: number;
  place: number;
}

/** Classement : total décroissant, ex æquo à la même place. */
export function leaderboard(players: readonly Player[], round: number): Rank[] {
  const rows = players
    .map((p) => ({ uid: p.uid, name: p.name, total: totalScore(p), last: p.scores[String(round)] ?? 0, place: 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr'));
  rows.forEach((r, i) => {
    r.place = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].place : i + 1;
  });
  return rows;
}

/** Ordre de passage devant le jury : ordre d'arrivée dans la salle. */
export function playerOrder(players: readonly Player[]): string[] {
  return players
    .filter((p) => !p.left)
    .slice()
    .sort((a, b) => (a.joinedAtMs ?? Infinity) - (b.joinedAtMs ?? Infinity) || a.uid.localeCompare(b.uid))
    .map((p) => p.uid);
}

/** Un joueur est « absent » s'il n'a pas donné signe de vie depuis ce délai. */
export const STALE_MS = 45_000;
export function isStale(p: Player | undefined, nowServerMs: number): boolean {
  if (!p || p.left) return true;
  if (p.lastSeenMs == null) return false;
  return nowServerMs - p.lastSeenMs > STALE_MS;
}

/** Salles visibles dans « Rejoindre » : en attente, créées il y a moins de 3 h. */
export const LOBBY_MAX_AGE_MS = 3 * 3600 * 1000;
export function isJoinable(r: Room, nowMs: number): boolean {
  if (r.status !== 'lobby') return false;
  if (r.createdAtMs == null) return true;
  return nowMs - r.createdAtMs < LOBBY_MAX_AGE_MS;
}
