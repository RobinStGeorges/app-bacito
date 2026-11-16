<script lang="ts">
  import { toFrenchMessage } from 'famille-core';
  import { watchLobbies } from './firestore';
  import { isJoinable, type Room } from './game';
  import { go } from './router.svelte';

  let { familyId }: { familyId: string } = $props();

  let lobbies = $state.raw<Room[] | null>(null);
  let error = $state('');
  let now = $state(Date.now());

  $effect(() => {
    const fid = familyId; // réabonnement si la famille change
    lobbies = null;
    error = '';
    const stop = watchLobbies(
      fid,
      (r) => (lobbies = r),
      (e) => (error = toFrenchMessage(e)),
    );
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      stop();
      clearInterval(t);
    };
  });

  const visible = $derived(
    (lobbies ?? []).filter((r) => isJoinable(r, now)).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)),
  );
</script>

<div class="bac-topbar">
  <button class="bac-link" onclick={() => go('/')}>← Menu</button>
</div>

<h1 class="bac-title">Rejoindre</h1>
<p class="bac-sub">Les parties en attente de joueurs</p>

{#if error}
  <p class="fc-error">{error}</p>
{:else if lobbies === null}
  <div class="bac-center"><span class="bac-spinner" aria-label="Chargement"></span></div>
{:else if visible.length === 0}
  <div class="fc-card">
    <p>Aucune partie en attente pour l'instant.</p>
    <p class="fc-muted">Demande à quelqu'un de lancer une partie, ou lance la tienne depuis le menu.</p>
  </div>
{:else}
  <div class="bac-stack">
    {#each visible as r (r.id)}
      <button class="fc-card lobby" onclick={() => go(`/partie/${r.id}`)}>
        <span class="who">Partie de {r.hostName}</span>
        <span class="fc-muted">Chrono {Math.floor(r.durationSec / 60)} min {String(r.durationSec % 60).padStart(2, '0')}</span>
        <span class="go">Rejoindre →</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .lobby {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.2rem 0.8rem;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
    min-height: 72px;
    width: 100%;
  }
  .who {
    font-weight: 700;
    font-size: 1.1rem;
  }
  .go {
    grid-row: 1 / span 2;
    grid-column: 2;
    align-self: center;
    color: var(--fc-primary);
    font-weight: 700;
  }
</style>
