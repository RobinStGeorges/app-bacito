export {};
// Aperçu local sans Firebase : chaque iframe est un joueur (?u=alice&n=Alice).
(window as unknown as { __BAC_FAKE_SYNC__: boolean }).__BAC_FAKE_SYNC__ = true;
const p = new URLSearchParams(location.search);
const theme = p.get('theme');
if (theme) document.documentElement.setAttribute('data-theme', theme);
const { _setSession } = await import('../fake/famille-core');
_setSession({
  status: 'ready',
  user: { uid: p.get('u') ?? 'alice' },
  displayName: p.get('n') ?? 'Alice',
  familyId: 'demo',
  familyName: 'Démo',
  isOwner: true,
});
await import('famille-core/theme.css');
await import('../../src/app.css');
const { mount } = await import('svelte');
const { default: App } = await import('../../src/App.svelte');
mount(App, { target: document.getElementById('app')! });
