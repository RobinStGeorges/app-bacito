<script lang="ts">
  import { startRound } from './firestore';
  import { leaderboard, type Player, type Room } from './game';

  let { familyId, room, players, isHost, onleave }: {
    familyId: string;
    room: Room;
    players: Player[];
    isHost: boolean;
    onleave: () => void;
  } = $props();

  const ranks = $derived(leaderboard(players, room.round));
  const medal = (place: number) => (place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}ᵉ`);
  const gone = (uid: string) => players.find((p) => p.uid === uid)?.left === true;
</script>

<h1 class="bac-title">Classement</h1>
<p class="bac-sub">Après {room.round} manche{room.round > 1 ? 's' : ''}</p>

<ol class="fc-card board">
  {#each ranks as r (r.uid)}
    <li class:gone={gone(r.uid)}>
      <span class="place">{medal(r.place)}</span>
      <span class="name">{r.name}{gone(r.uid) ? ' (parti)' : ''}</span>
      <span class="pts"><strong>{r.total}</strong> <small class="fc-muted">(+{r.last})</small></span>
    </li>
  {/each}
</ol>

<div class="bac-stack actions">
  {#if isHost}
    <button class="fc-btn fc-btn-primary fc-btn-block" onclick={() => startRound(familyId, room, players)}>🔁 Rejouer</button>
  {:else}
    <p class="fc-muted center">{room.hostName} peut relancer une manche avec les mêmes joueurs.</p>
  {/if}
  <button class="fc-btn fc-btn-block" onclick={onleave}>Retour au menu</button>
</div>

<style>
  .board {
    list-style: none;
    margin: 0;
    padding: 0.4rem 1rem;
  }
  li {
    display: grid;
    grid-template-columns: 2.6rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    min-height: 54px;
    border-bottom: 1px dashed var(--fc-border);
    font-size: 1.1rem;
  }
  li:last-child {
    border-bottom: 0;
  }
  li.gone {
    opacity: 0.55;
  }
  .place {
    font-size: 1.5rem;
    text-align: center;
    font-family: var(--bac-hand);
    color: var(--bac-red-ink);
  }
  .pts strong {
    font-family: var(--bac-hand);
    color: var(--bac-ink);
    font-size: 1.4rem;
  }
  .actions {
    margin-top: 1.2rem;
  }
  .center {
    text-align: center;
  }
</style>
