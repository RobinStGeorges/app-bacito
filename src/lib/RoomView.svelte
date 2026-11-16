<script lang="ts">
  import { toFrenchMessage } from 'famille-core';
  import { heartbeat, joinRoom, leaveRoom, takeHost, watchAnswers, watchPlayers, watchRoom, watchVotes } from './firestore';
  import { isStale, type Answers, type Player, type Room, type Vote } from './game';
  import { serverNow } from './clock';
  import { go, rememberRoom } from './router.svelte';
  import Lobby from './Lobby.svelte';
  import Play from './Play.svelte';
  import Judge from './Judge.svelte';
  import Results from './Results.svelte';

  let { familyId, roomId, uid, name }: { familyId: string; roomId: string; uid: string; name: string } = $props();

  // $state.raw : ces objets partent tels quels dans les fonctions pures (pas de proxys).
  let room = $state.raw<Room | null | undefined>(undefined); // undefined = chargement
  let players = $state.raw<Player[]>([]);
  let answers = $state.raw<Answers[]>([]);
  let votes = $state.raw<Vote[]>([]);
  let error = $state('');
  let now = $state(serverNow());
  let joinRequested = false;

  const onErr = (e: unknown) => (error = toFrenchMessage(e));

  $effect(() => {
    const fid = familyId;
    const stops = [
      watchRoom(fid, roomId, (r, fromCache) => {
        // Hors-ligne et jamais vu : on attend plutôt que d'afficher « introuvable ».
        if (r === null && fromCache) return;
        room = r;
      }, onErr),
      watchPlayers(fid, roomId, uid, (p) => (players = p), onErr),
    ];
    const t = setInterval(() => (now = serverNow()), 1000);
    return () => {
      stops.forEach((s) => s());
      clearInterval(t);
    };
  });

  // Copies et votes de la manche : seulement pendant le jury (économise le quota de lectures
  // gratuit : pendant la saisie, chaque frappe n'est pas renvoyée à tous les téléphones).
  const round = $derived(room?.round ?? 0);
  const judging = $derived(room?.status === 'judging');
  $effect(() => {
    const fid = familyId;
    const r = round;
    answers = [];
    votes = [];
    if (r < 1 || !judging) return;
    const a = watchAnswers(fid, roomId, r, (x) => (answers = x), onErr);
    const v = watchVotes(fid, roomId, r, (x) => (votes = x), onErr);
    return () => {
      a();
      v();
    };
  });

  const me = $derived(players.find((p) => p.uid === uid));
  const isHost = $derived(room?.hostUid === uid);
  const host = $derived(players.find((p) => p.uid === room?.hostUid));
  const hostAway = $derived(!!room && !isHost && !!me && !me.left && room.status !== 'closed' && isStale(host, now));

  // Arrivée dans une salle d'attente : on s'inscrit automatiquement (une seule fois, et jamais
  // pendant qu'on la quitte, sinon on se réinscrirait avant d'avoir changé d'écran).
  $effect(() => {
    if (me) joinRequested = true;
    if (room && room.status === 'lobby' && !me && !joinRequested) {
      joinRequested = true;
      joinRoom(familyId, roomId, uid, name);
    }
  });

  // Présence : battement toutes les 20 s (sert aussi à mesurer l'heure serveur).
  // On ne dépend que d'un booléen, sinon chaque instantané relancerait un battement (boucle).
  const present = $derived(!!me && !me.left);
  $effect(() => {
    if (!present) return;
    const fid = familyId;
    heartbeat(fid, roomId, uid);
    const t = setInterval(() => heartbeat(fid, roomId, uid), 20_000);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (present && room?.status !== 'closed') rememberRoom(familyId, roomId);
  });

  function leave() {
    joinRequested = true;
    if (room && me) leaveRoom(familyId, room, uid, players);
    rememberRoom(familyId, null);
    go('/');
  }

  const activePlayers = $derived(players.filter((p) => !p.left));
</script>

<div class="bac-topbar">
  <button class="bac-link" onclick={leave}>← Quitter</button>
  {#if room && room.round > 0 && room.status !== 'lobby'}
    <span class="fc-muted">Manche {room.round}</span>
  {/if}
</div>

{#if error}
  <div class="fc-card bac-stack">
    <p class="fc-error">{error}</p>
    <button class="fc-btn fc-btn-block" onclick={() => go('/')}>Retour au menu</button>
  </div>
{:else if room === undefined}
  <div class="bac-center"><span class="bac-spinner" aria-label="Chargement"></span></div>
{:else if room === null || room.status === 'closed'}
  <div class="fc-card bac-stack">
    <p>Cette partie est terminée ou n'existe plus.</p>
    <button class="fc-btn fc-btn-primary fc-btn-block" onclick={() => { rememberRoom(familyId, null); go('/'); }}>Retour au menu</button>
  </div>
{:else if !me && room.status !== 'lobby'}
  <div class="fc-card bac-stack">
    <p>Cette partie a déjà commencé sans toi. Attends la prochaine !</p>
    <button class="fc-btn fc-btn-primary fc-btn-block" onclick={() => go('/')}>Retour au menu</button>
  </div>
{:else if me?.left && room.status !== 'lobby'}
  <div class="fc-card bac-stack">
    <p>Tu as quitté cette partie.</p>
    <button class="fc-btn fc-btn-primary fc-btn-block" onclick={() => go('/')}>Retour au menu</button>
  </div>
{:else if !me}
  <div class="bac-center"><span class="bac-spinner" aria-label="Arrivée dans la salle"></span></div>
{:else}
  {#if hostAway}
    <div class="fc-card away">
      <p>{room.hostName} ne répond plus (téléphone en veille ?).</p>
      <button class="fc-btn fc-btn-block" onclick={() => takeHost(familyId, roomId, uid, name, room!.hostUid)}>
        Prendre la main sur la partie
      </button>
    </div>
  {/if}

  {#if room.status === 'lobby'}
    <Lobby {familyId} {room} players={activePlayers} {isHost} {uid} {now} />
  {:else if room.status === 'playing'}
    {#key room.round}
      <Play {familyId} {room} {uid} />
    {/key}
  {:else if room.status === 'judging'}
    <Judge {familyId} {room} {players} {answers} {votes} {uid} {isHost} />
  {:else if room.status === 'results'}
    <Results {familyId} {room} {players} {isHost} onleave={leave} />
  {/if}
{/if}

<style>
  .away {
    margin-bottom: 1rem;
    border-color: var(--bac-margin);
  }
  .away p {
    margin-top: 0;
  }
</style>
