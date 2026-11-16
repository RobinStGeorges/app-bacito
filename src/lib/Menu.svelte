<script lang="ts">
  import { createRoom } from './firestore';
  import { go, lastRoom } from './router.svelte';

  let { familyId, uid, name }: { familyId: string; uid: string; name: string } = $props();

  const resume = $derived(lastRoom(familyId));

  function launch() {
    const id = createRoom(familyId, uid, name);
    go(`/partie/${id}`);
  }
</script>

<div class="bac-topbar">
  <a class="bac-link" href="/">← Portail</a>
</div>

<h1 class="bac-title">Le Bacito ☝️🤓</h1>
<p class="bac-sub">Le petit bac de la famille</p>

<div class="bac-stack">
  <button class="fc-btn fc-btn-primary fc-btn-block big" onclick={launch}>✏️ Lancer une partie</button>
  <button class="fc-btn fc-btn-block big" onclick={() => go('/rejoindre')}>🙋 Rejoindre une partie</button>
  {#if resume}
    <button class="fc-btn fc-btn-block" onclick={() => go(`/partie/${resume}`)}>↩︎ Reprendre ma dernière partie</button>
  {/if}
</div>

<div class="fc-card rules">
  <h2 class="bac-h2">La règle</h2>
  <ol>
    <li>Une lettre et 6 catégories sont tirées au sort.</li>
    <li>Trouve un mot par catégorie avant la fin du chrono.</li>
    <li>Le jury vote 👍 ou 👎 sur chaque réponse : égalité = accepté.</li>
    <li>1 point par réponse acceptée. Les points s'ajoutent d'une manche à l'autre.</li>
  </ol>
</div>

<style>
  .big {
    min-height: 64px;
    font-size: 1.15rem;
  }
  .rules {
    margin-top: 1.5rem;
  }
  .rules h2 {
    margin-top: 0;
  }
  ol {
    margin: 0;
    padding-left: 1.2rem;
  }
  li {
    margin-bottom: 0.35rem;
  }
</style>
