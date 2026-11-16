<script lang="ts">
  import { signIn, toFrenchMessage } from 'famille-core';

  let { status }: { status: string } = $props();

  const dev = import.meta.env.DEV;
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function login(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    busy = true;
    try {
      await signIn(email, password); // connexion : ici on attend, ce n'est pas une écriture de données
    } catch (err) {
      error = toFrenchMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<h1 class="bac-title">Le Bacito ☝️🤓</h1>
<div class="fc-card bac-stack">
  {#if status === 'noFamily'}
    <p>Choisissez ou rejoignez une famille depuis le portail pour jouer.</p>
  {:else}
    <p>Connectez-vous depuis le portail pour jouer au petit bac en famille.</p>
  {/if}
  <a class="fc-btn fc-btn-primary fc-btn-block" href="/">Aller au portail</a>
</div>

{#if dev && status === 'signedOut'}
  <form class="fc-card bac-stack" style="margin-top:1rem" onsubmit={login}>
    <p class="fc-muted">Connexion de développement (absente en production)</p>
    <input class="fc-input" type="email" autocomplete="email" placeholder="E-mail" bind:value={email} required />
    <input class="fc-input" type="password" autocomplete="current-password" placeholder="Mot de passe" bind:value={password} required />
    {#if error}<p class="fc-error">{error}</p>{/if}
    <button class="fc-btn fc-btn-primary fc-btn-block" disabled={busy}>Se connecter</button>
  </form>
{/if}
