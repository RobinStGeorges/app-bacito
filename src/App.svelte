<script lang="ts">
  import { session } from 'famille-core';
  import { route } from './lib/router.svelte';
  import { pwa, applyUpdate } from './lib/pwa.svelte';
  import { toasts, dismiss } from './lib/errors.svelte';
  import SignedOut from './lib/SignedOut.svelte';
  import Menu from './lib/Menu.svelte';
  import JoinList from './lib/JoinList.svelte';
  import RoomView from './lib/RoomView.svelte';
</script>

{#if !pwa.online}
  <div class="bac-banner offline" role="status">📡 Hors connexion : la partie reprendra au retour du réseau.</div>
{/if}
{#if pwa.needRefresh}
  <div class="bac-banner update" role="status">
    <span>Nouvelle version disponible</span>
    <button class="fc-btn" onclick={applyUpdate}>Mettre à jour</button>
  </div>
{/if}

<main class="bac-page">
  {#if $session.status === 'loading'}
    <div class="bac-center"><span class="bac-spinner" aria-label="Chargement"></span></div>
  {:else if $session.status !== 'ready'}
    <SignedOut status={$session.status} />
  {:else}
    {@const s = $session}
    {#key s.familyId}
      {#if route.current.name === 'menu'}
        <Menu familyId={s.familyId} uid={s.user.uid} name={s.displayName} />
      {:else if route.current.name === 'join'}
        <JoinList familyId={s.familyId} />
      {:else}
        {#key route.current.id}
          <RoomView familyId={s.familyId} roomId={route.current.id} uid={s.user.uid} name={s.displayName} />
        {/key}
      {/if}
    {/key}
  {/if}
</main>

{#if toasts.length}
  <div class="bac-toasts" aria-live="polite">
    {#each toasts as t (t.id)}
      <button class="bac-toast" onclick={() => dismiss(t.id)}>{t.text}</button>
    {/each}
  </div>
{/if}
