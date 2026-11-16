<script lang="ts">
  import { untrack } from 'svelte';
  import { beginJudging, saveAnswers, watchMyAnswers } from './firestore';
  import { CATEGORY_COUNT, formatClock, remainingMs, startsWithLetter, type Room } from './game';
  import { serverNow } from './clock';

  let { familyId, room, uid }: { familyId: string; room: Room; uid: string } = $props();

  // Composant recréé à chaque manche ({#key room.round}) : on fige la manche au montage.
  const round = untrack(() => room.round);
  const fid = untrack(() => familyId);
  const rid = untrack(() => room.id);

  let values = $state<string[]>(Array(CATEGORY_COUNT).fill(''));
  let touched = false;
  let lastSaved = '';

  // Après un rechargement de page : on retrouve sa copie déjà enregistrée.
  $effect(() =>
    watchMyAnswers(fid, rid, round, uid, (mine) => {
      if (mine && !touched) {
        values = mine.values.slice();
        lastSaved = JSON.stringify(mine.values);
      }
    }),
  );

  let left = $state(remainingMs(untrack(() => room.startedAtMs), untrack(() => room.durationSec), serverNow()));
  const locked = $derived(left <= 0);
  const urgent = $derived(left > 0 && left <= 10_000);

  function flush() {
    const snapshot = $state.snapshot(values);
    const key = JSON.stringify(snapshot);
    if (key === lastSaved) return;
    lastSaved = key;
    saveAnswers(fid, rid, round, uid, snapshot);
  }

  let debounce: ReturnType<typeof setTimeout> | undefined;
  function onInput(i: number, v: string) {
    if (locked) return;
    touched = true;
    values[i] = v;
    clearTimeout(debounce);
    debounce = setTimeout(flush, 700);
  }

  let endedAt: number | null = null;
  $effect(() => {
    const t = setInterval(() => {
      left = remainingMs(room.startedAtMs, room.durationSec, serverNow());
      if (left > 0) return;
      if (endedAt === null) {
        endedAt = Date.now();
        clearTimeout(debounce);
        flush(); // copie définitive
        navigator.vibrate?.(200);
      }
      // 2 s de grâce pour que les dernières copies arrivent, puis toutes les 3 s on retente
      // (le premier téléphone qui y arrive fait passer tout le monde au jury).
      const since = Date.now() - endedAt;
      if (since >= 2000 && Math.floor((since - 2000) / 250) % 12 === 0) beginJudging(fid, rid, round);
    }, 250);
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(debounce);
      if (!locked) flush();
    };
  });

  function next(e: KeyboardEvent, i: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const el = document.getElementById(`bac-a${i + 1}`);
    if (el) el.focus();
    else (e.currentTarget as HTMLInputElement).blur();
  }
</script>

<div class="head">
  <div class="letter" aria-label="Lettre {room.letter}">{room.letter}</div>
  <div class="timer" class:urgent class:done={locked} role="timer" aria-live="off">
    {locked ? 'Stylos levés !' : formatClock(left)}
  </div>
</div>

{#if room.startedAtMs == null}
  <p class="fc-muted">Synchronisation du chrono…</p>
{/if}

<div class="sheet">
  {#each room.categories as cat, i (i)}
    <label class="line">
      <span class="cat">{cat}</span>
      <input
        id="bac-a{i}"
        class="fc-input answer"
        class:off={values[i].trim() !== '' && !startsWithLetter(values[i], room.letter)}
        value={values[i]}
        oninput={(e) => onInput(i, e.currentTarget.value)}
        onkeydown={(e) => next(e, i)}
        disabled={locked}
        maxlength="60"
        autocomplete="off"
        autocapitalize="sentences"
        spellcheck="false"
        enterkeyhint={i < CATEGORY_COUNT - 1 ? 'next' : 'done'}
        placeholder="{room.letter}…"
      />
    </label>
  {/each}
</div>

{#if locked}
  <p class="bac-center fc-muted">Ramassage des copies… le jury arrive.</p>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0.4rem 0 1rem;
  }
  .letter {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 700;
    font-size: 4.2rem;
    line-height: 1;
    color: var(--bac-red-ink);
    width: 88px;
    height: 88px;
    display: grid;
    place-items: center;
    border: 3px solid var(--bac-red-ink);
    border-radius: 50%;
    transform: rotate(-6deg);
    background: var(--fc-surface);
  }
  .timer {
    font-family: var(--bac-hand);
    font-size: 2.4rem;
    color: var(--bac-ink);
    font-variant-numeric: tabular-nums;
  }
  .timer.urgent {
    color: var(--bac-red-ink);
  }
  .timer.done {
    font-size: 1.6rem;
    color: var(--bac-red-ink);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .line {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .cat {
    font-family: var(--bac-hand);
    color: var(--bac-red-ink);
    font-size: 1.15rem;
  }
  .answer {
    color: var(--bac-ink);
    font-size: 1.15rem;
    font-weight: 600;
  }
  .answer.off {
    border-style: dashed;
    border-color: var(--bac-red-ink);
  }
  .answer:disabled {
    opacity: 0.85;
  }
</style>
