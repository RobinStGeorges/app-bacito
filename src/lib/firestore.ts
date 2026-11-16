// Accès aux données : tout est rangé sous families/{familyId}/apps/bacito/…
//   rooms/{roomId}                          une partie (salle d'attente puis manches)
//   rooms/{roomId}/players/{uid}            un joueur (nom, présence, points par manche)
//   rooms/{roomId}/answers/{manche}_{uid}   la copie d'un joueur pour une manche
//   rooms/{roomId}/votes/{manche}_{cible}_{juré}  les 👍/👎 d'un juré sur une copie
// Un document par élément : deux téléphones n'écrivent jamais dans le même document,
// sauf le document de la salle (que seul l'hôte modifie, ou une transaction).
//
// Règle : l'interface n'attend JAMAIS la fin d'une écriture (pas d'await) ; un refus du serveur
// est seulement signalé par un message (report).

import {
  arrayUnion,
  deleteField,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { appCollection, getServices } from 'famille-core';
import {
  CATEGORY_COUNT,
  answersId,
  clampDuration,
  drawCategories,
  drawLetter,
  parseAnswers,
  parsePlayer,
  parseRoom,
  parseVote,
  playerOrder,
  roundScores,
  voteId,
  type Answers,
  type Player,
  type Room,
  type Vote,
} from './game';
import { markSent, onServerTime } from './clock';
import { report } from './errors.svelte';

export const APP_ID = 'bacito';

const rooms = (fid: string) => appCollection(fid, APP_ID, 'rooms');
const players = (fid: string, rid: string) => appCollection(fid, APP_ID, 'rooms', rid, 'players');
const answers = (fid: string, rid: string) => appCollection(fid, APP_ID, 'rooms', rid, 'answers');
const votes = (fid: string, rid: string) => appCollection(fid, APP_ID, 'rooms', rid, 'votes');

/** Les horodatages pas encore confirmés par le serveur sont estimés localement (jamais null). */
const data = (s: DocumentSnapshot<DocumentData>) =>
  s.data({ serverTimestamps: 'estimate' }) as Record<string, unknown> | undefined;

type Unsub = () => void;
type OnErr = (e: unknown) => void;

// ---------- Écoutes ----------

export function watchLobbies(fid: string, cb: (r: Room[]) => void, onErr: OnErr): Unsub {
  return onSnapshot(
    query(rooms(fid), where('status', '==', 'lobby')),
    (snap) => cb(snap.docs.map((d) => parseRoom(d.id, data(d)))),
    onErr,
  );
}

export function watchRoom(fid: string, rid: string, cb: (r: Room | null, fromCache: boolean) => void, onErr: OnErr): Unsub {
  return onSnapshot(
    doc(rooms(fid), rid),
    (s) => cb(s.exists() ? parseRoom(s.id, data(s)) : null, s.metadata.fromCache),
    onErr,
  );
}

export function watchPlayers(fid: string, rid: string, myUid: string, cb: (p: Player[]) => void, onErr: OnErr): Unsub {
  return onSnapshot(
    players(fid, rid),
    { includeMetadataChanges: true },
    (snap) => {
      cb(snap.docs.map((d) => parsePlayer(d.id, data(d))));
      // Mesure du décalage d'horloge sur notre propre battement de présence, une fois confirmé.
      const mine = snap.docs.find((d) => d.id === myUid);
      if (mine && !mine.metadata.hasPendingWrites) {
        onServerTime(parsePlayer(mine.id, data(mine)).lastSeenMs);
      }
    },
    onErr,
  );
}

export function watchAnswers(fid: string, rid: string, round: number, cb: (a: Answers[]) => void, onErr: OnErr): Unsub {
  return onSnapshot(
    query(answers(fid, rid), where('round', '==', round)),
    (snap) => cb(snap.docs.map((d) => parseAnswers(data(d)))),
    onErr,
  );
}

/** Sa propre copie (pour la retrouver après un rechargement pendant la manche). */
export function watchMyAnswers(fid: string, rid: string, round: number, uid: string, cb: (a: Answers | null) => void): Unsub {
  return onSnapshot(
    doc(answers(fid, rid), answersId(round, uid)),
    (s) => cb(s.exists() ? parseAnswers(data(s)) : null),
    () => {},
  );
}

export function watchVotes(fid: string, rid: string, round: number, cb: (v: Vote[]) => void, onErr: OnErr): Unsub {
  return onSnapshot(
    query(votes(fid, rid), where('round', '==', round)),
    (snap) => cb(snap.docs.map((d) => parseVote(data(d)))),
    onErr,
  );
}

// ---------- Salle d'attente ----------

/** Crée une salle dont on est l'hôte ; renvoie son identifiant immédiatement (même hors-ligne). */
export function createRoom(fid: string, uid: string, name: string): string {
  const ref = doc(rooms(fid));
  const batch = writeBatch(getServices().db);
  batch.set(ref, {
    hostUid: uid,
    hostName: name,
    status: 'lobby',
    durationSec: 90,
    hardLetters: false,
    round: 0,
    letter: '',
    categories: [],
    usedLetters: [],
    judgeOrder: [],
    judgeIndex: 0,
    createdAt: serverTimestamp(),
  });
  markSent();
  batch.set(doc(players(fid, ref.id), uid), {
    name,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    left: false,
    scores: {},
  });
  batch.commit().catch(report);
  return ref.id;
}

export function joinRoom(fid: string, rid: string, uid: string, name: string): void {
  markSent();
  setDoc(
    doc(players(fid, rid), uid),
    // pas de « scores » ici : une fusion avec {} effacerait des points déjà gagnés
    { name, joinedAt: serverTimestamp(), lastSeen: serverTimestamp(), left: false },
    { merge: true },
  ).catch(report);
}

/** Battement de présence (toutes les 20 s tant que l'écran de la partie est ouvert). */
export function heartbeat(fid: string, rid: string, uid: string): void {
  markSent();
  updateDoc(doc(players(fid, rid), uid), { lastSeen: serverTimestamp() }).catch(() => {
    /* hors-ligne ou joueur retiré : sans gravité */
  });
}

export function updateSettings(fid: string, rid: string, s: { durationSec?: number; hardLetters?: boolean }): void {
  const patch: Record<string, unknown> = {};
  if (s.durationSec != null) patch.durationSec = clampDuration(s.durationSec);
  if (s.hardLetters != null) patch.hardLetters = s.hardLetters;
  updateDoc(doc(rooms(fid), rid), patch).catch(report);
}

/**
 * Quitter la salle. En salle d'attente on disparaît de la liste ; en cours de partie on est
 * marqué « parti » (la copie reste jugée). Si l'hôte part, il passe la main au plus ancien joueur.
 */
export function leaveRoom(fid: string, room: Room, uid: string, all: readonly Player[]): void {
  const batch = writeBatch(getServices().db);
  const pref = doc(players(fid, room.id), uid);
  if (room.status === 'lobby') batch.delete(pref);
  else batch.update(pref, { left: true });

  if (room.hostUid === uid) {
    const next = playerOrder(all).find((p) => p !== uid);
    const rref = doc(rooms(fid), room.id);
    if (next) {
      const nextName = all.find((p) => p.uid === next)?.name ?? '';
      batch.update(rref, { hostUid: next, hostName: nextName });
    } else {
      batch.update(rref, { status: 'closed' });
    }
  }
  batch.commit().catch(report);
}

/** Reprendre le rôle d'hôte si l'hôte ne donne plus signe de vie (vérifié côté transaction). */
export function takeHost(fid: string, rid: string, uid: string, name: string, previousHost: string): void {
  const { db } = getServices();
  runTransaction(db, async (tx) => {
    const ref = doc(rooms(fid), rid);
    const s = await tx.get(ref);
    if (!s.exists() || s.data().hostUid !== previousHost) return;
    tx.update(ref, { hostUid: uid, hostName: name });
  }).catch(report);
}

// ---------- Manches ----------

/** Lance une manche (première ou « Rejouer ») : nouvelle lettre, 6 nouvelles catégories. */
export function startRound(fid: string, room: Room, all: readonly Player[]): void {
  const rng = Math.random;
  const letter = drawLetter(rng, room.usedLetters, room.hardLetters);
  updateDoc(doc(rooms(fid), room.id), {
    status: 'playing',
    round: room.round + 1,
    letter,
    categories: drawCategories(rng, CATEGORY_COUNT),
    usedLetters: arrayUnion(letter),
    judgeOrder: playerOrder(all),
    judgeIndex: 0,
    startedAt: serverTimestamp(),
  }).catch(report);
}

/** Enregistre la copie (appelée au fil de la frappe, avec un léger délai, puis à la fin du chrono). */
export function saveAnswers(fid: string, rid: string, round: number, uid: string, values: readonly string[]): void {
  setDoc(doc(answers(fid, rid), answersId(round, uid)), {
    uid,
    round,
    values: values.slice(0, CATEGORY_COUNT).map((v) => v.slice(0, 60)),
    updatedAt: serverTimestamp(),
  }).catch(report);
}

/**
 * Fin du chrono → passage au jury. N'importe quel joueur peut le déclencher (si l'hôte a mis
 * son téléphone en veille) ; la transaction garantit qu'on ne le fait qu'une fois.
 * Échec hors-ligne : ignoré, on réessaiera au prochain tic.
 */
export function beginJudging(fid: string, rid: string, round: number): void {
  const { db } = getServices();
  runTransaction(db, async (tx) => {
    const ref = doc(rooms(fid), rid);
    const s = await tx.get(ref);
    if (!s.exists()) return;
    const d = s.data();
    if (d.status !== 'playing' || d.round !== round) return;
    tx.update(ref, { status: 'judging', judgeIndex: 0 });
  }).catch(() => {});
}

/** Vote d'un juré sur une catégorie (1 = 👍, -1 = 👎, 0 = annuler). */
export function castVote(fid: string, rid: string, round: number, target: string, voter: string, i: number, value: number): void {
  setDoc(
    doc(votes(fid, rid), voteId(round, target, voter)),
    { round, target, voter, v: { [String(i)]: value === 0 ? deleteField() : value } },
    { merge: true },
  ).catch(report);
}

/**
 * L'hôte passe à la copie suivante : il fige les points de la copie jugée (tels qu'il les voit,
 * donc tels qu'affichés à tous) puis avance, ou affiche le classement après la dernière copie.
 * Les points sont stockés par manche (scores.{manche} = n) : réécrire est sans effet de bord,
 * contrairement à un compteur increment() qui doublerait en cas de double appui.
 */
export function nextJudge(fid: string, room: Room, allAnswers: readonly Answers[], allVotes: readonly Vote[]): void {
  const target = room.judgeOrder[room.judgeIndex];
  const batch = writeBatch(getServices().db);
  if (target) {
    const pts = roundScores(room.round, [target], allAnswers, allVotes)[target] ?? 0;
    batch.set(doc(players(fid, room.id), target), { scores: { [String(room.round)]: pts } }, { merge: true });
  }
  const last = room.judgeIndex >= room.judgeOrder.length - 1;
  batch.update(doc(rooms(fid), room.id), last ? { status: 'results' } : { judgeIndex: room.judgeIndex + 1 });
  batch.commit().catch(report);
}

export function closeRoom(fid: string, rid: string): void {
  updateDoc(doc(rooms(fid), rid), { status: 'closed' }).catch(report);
}
