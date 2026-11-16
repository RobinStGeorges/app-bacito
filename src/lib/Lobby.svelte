<script lang="ts">
  import { startRound, updateSettings } from './firestore';
  import { DURATION_STEP_SEC, MAX_DURATION_SEC, MIN_DURATION_SEC, formatClock, isStale, playerOrder, type Player, type Room } from './game';

  let { familyId, room, players, isHost, uid, now }: {
    familyId: string;
    room: Room;
    players: Player[];
    isHost: boolean;
    uid: string;
    now: number;
  } = $props();

  const ordered = $derived(playerOrder(players).map((id) => players.find((p) => p.uid === id)!));

  function setDuration(delta: number) {
    const d = room.durationSec + delta;
    if (d < MIN_DURATION_SEC || d > MAX_DURATION_SEC) return;
    updateSettings(familyId, room.id, { durationSec: d });
  }
</script>

<h1 class="bac-title">Salle d'attente</h1>
<p class="bac-sub">Partie de {room.hostName}</p>

<div class="fc-card">
  <h2 class="bac-h2 first">Joueurs ({ordered.length})</h2>
  <ul class="players">
    {#each ordered as p (p.uid)}
      <li class:away={isStale(p, now)}>
        <span>{p.name}{p.uid === uid ? ' (toi)' : ''}</span>
        {#if p.uid === room.hostUid}<span class="tag">hôte</span>{/if}
      </li>
    {/each}
  </ul>
  {#if ordered.length < 2}
    <p class="fc-muted small">Les autres rejoignent avec « Rejoindre une partie » dans le menu du Bacito.</p>
  {/if}
</div>

<div class="fc-card settings">
  <h2 class="bac-h2 first">Réglages</h2>
  <div class="setting">
    <span>Chrono</span>
    {#if isHost}
      <div class="bac-row">
        <button class="fc-btn step" aria-label="Moins de temps" disabled={room.durationSec <= MIN_DURATION_SEC} onclick={() => setDuration(-DURATION_STEP_SEC)}>−</button>
        <strong class="clock">{formatClock(room.durationSec * 1000)}</strong>
        <button class="fc-btn step" aria-label="Plus de temps" disabled={room.durationSec >= MAX_DURATION_SEC} onclick={() => setDuration(DURATION_STEP_SEC)}>+</button>
      </div>
    {:else}
      <strong class="clock">{formatClock(room.durationSec * 1000)}</strong>
    {/if}
  </div>
  <label class="setting check">
    <span>Lettres difficiles (K, Q, W, X, Y, Z)</span>
    <input
      type="checkbox"
      checked={room.hardLetters}
      disabled={!isHost}
      onchange={(e) => updateSettings(familyId, room.id, { hardLetters: e.currentTarget.checked })}
    />
  </label>
</div>

{#if isHost}
  <button class="fc-btn fc-btn-primary fc-btn-block go" onclick={() => startRound(familyId, room, players)}>GO !</button>
  {#if ordered.length < 2}<p class="fc-muted small center">Tu peux jouer seul, mais sans jury toutes les réponses seront acceptées.</p>{/if}
{:else}
  <p class="bac-center fc-muted">En attente de {room.hostName} pour lancer la partie…</p>
{/if}

<style>
  .first {
    margin-top: 0;
  }
  .fc-card + .fc-card {
    margin-top: 0.9rem;
  }
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .players li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    border-bottom: 1px dashed var(--fc-border);
    font-size: 1.05rem;
  }
  .players li.away {
    opacity: 0.5;
  }
  .tag {
    font-family: var(--bac-hand);
    color: var(--bac-red-ink);
    font-size: 0.95rem;
  }
  .setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    min-height: 56px;
  }
  .check input {
    width: 28px;
    height: 28px;
    accent-color: var(--fc-primary);
  }
  .step {
    width: 52px;
    padding: 0;
    font-size: 1.4rem;
  }
  .clock {
    font-family: var(--bac-hand);
    font-size: 1.5rem;
    color: var(--bac-ink);
    min-width: 3.2rem;
    text-align: center;
  }
  .go {
    margin-top: 1.2rem;
    min-height: 68px;
    font-size: 1.6rem;
    font-family: var(--bac-hand);
  }
  .small {
    font-size: 0.92rem;
  }
  .center {
    text-align: center;
  }
</style>
