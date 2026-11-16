<script lang="ts">
  import { castVote, nextJudge } from './firestore';
  import { CATEGORY_COUNT, isValid, startsWithLetter, tally, type Answers, type Player, type Room, type Vote } from './game';

  let { familyId, room, players, answers, votes, uid, isHost }: {
    familyId: string;
    room: Room;
    players: Player[];
    answers: Answers[];
    votes: Vote[];
    uid: string;
    isHost: boolean;
  } = $props();

  const target = $derived(room.judgeOrder[room.judgeIndex] ?? '');
  const targetName = $derived(players.find((p) => p.uid === target)?.name ?? 'Joueur');
  const copy = $derived(answers.find((a) => a.uid === target && a.round === room.round)?.values ?? Array(CATEGORY_COUNT).fill(''));
  const isMine = $derived(target === uid);
  const myVote = $derived(votes.find((v) => v.target === target && v.voter === uid && v.round === room.round));
  const rows = $derived(
    room.categories.map((cat, i) => {
      const answer = copy[i] ?? '';
      const t = tally(votes, room.round, target, i);
      return {
        cat,
        answer,
        empty: answer.trim() === '',
        t,
        ok: isValid(answer, t),
        offLetter: answer.trim() !== '' && !startsWithLetter(answer, room.letter),
        mine: myVote?.values[i] ?? 0,
      };
    }),
  );
  const jurors = $derived(room.judgeOrder.filter((id) => id !== target && !players.find((p) => p.uid === id)?.left));
  const voted = $derived(new Set(votes.filter((v) => v.target === target && v.round === room.round && v.voter !== target && v.values.some((x) => x !== 0)).map((v) => v.voter)));
  const points = $derived(rows.filter((r) => r.ok).length);
  const last = $derived(room.judgeIndex >= room.judgeOrder.length - 1);

  function vote(i: number, value: 1 | -1) {
    if (isMine) return;
    const current = rows[i].mine;
    castVote(familyId, room.id, room.round, target, uid, i, current === value ? 0 : value);
  }
</script>

<p class="fc-muted progress">Copie {room.judgeIndex + 1} / {room.judgeOrder.length} · lettre <strong>{room.letter}</strong></p>
<h1 class="bac-title">{isMine ? 'Ta copie' : `Copie de ${targetName}`}</h1>
<p class="bac-sub">
  {#if isMine}Le jury délibère… pas de triche !{:else}👎 à gauche, 👍 à droite{/if}
</p>

<div class="sheet">
  {#each rows as r, i (i)}
    <div class="line">
      <div class="cat">
        <span>{r.cat}</span>
        <span class="stamp" class:ok={r.ok} class:ko={!r.ok}>{r.empty ? '—' : r.ok ? '✔ accepté' : '✘ refusé'}</span>
      </div>
      <div class="judge">
        <button
          class="thumb down"
          class:on={r.mine === -1}
          aria-label="Refuser « {r.answer} »"
          aria-pressed={r.mine === -1}
          disabled={isMine || r.empty}
          onclick={() => vote(i, -1)}
        >👎<span class="n">{r.t.down}</span></button>
        <input class="fc-input answer" class:off={r.offLetter} value={r.empty ? '' : r.answer} placeholder="(pas de réponse)" readonly tabindex="-1" />
        <button
          class="thumb up"
          class:on={r.mine === 1}
          aria-label="Accepter « {r.answer} »"
          aria-pressed={r.mine === 1}
          disabled={isMine || r.empty}
          onclick={() => vote(i, 1)}
        >👍<span class="n">{r.t.up}</span></button>
      </div>
      {#if r.offLetter}<p class="hint">Ne commence pas par {room.letter} ?</p>{/if}
    </div>
  {/each}
</div>

<div class="fc-card summary">
  <p><strong>{points}</strong> point{points > 1 ? 's' : ''} pour {isMine ? 'toi' : targetName} pour l'instant.</p>
  <p class="fc-muted">{voted.size} / {jurors.length} juré{jurors.length > 1 ? 's ont' : ' a'} voté</p>
</div>

{#if isHost}
  <button class="fc-btn fc-btn-primary fc-btn-block next" onclick={() => nextJudge(familyId, room, answers, votes)}>
    {last ? 'Voir le classement 🏆' : 'Copie suivante →'}
  </button>
{:else}
  <p class="bac-center fc-muted">L'hôte passera à la copie suivante.</p>
{/if}

<style>
  .progress {
    margin: 0.3rem 0 0;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .cat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: var(--bac-hand);
    color: var(--bac-red-ink);
    font-size: 1.1rem;
    margin-bottom: 0.25rem;
  }
  .stamp {
    font-size: 0.95rem;
  }
  .stamp.ok {
    color: var(--bac-up);
  }
  .stamp.ko {
    color: var(--bac-down);
  }
  .judge {
    display: grid;
    grid-template-columns: 56px 1fr 56px;
    gap: 0.45rem;
    align-items: center;
  }
  .answer {
    color: var(--bac-ink);
    font-weight: 600;
    font-size: 1.1rem;
    min-width: 0;
  }
  .answer.off {
    border-style: dashed;
    border-color: var(--bac-red-ink);
  }
  .thumb {
    position: relative;
    height: 56px;
    width: 56px;
    border-radius: 14px;
    font-size: 1.5rem;
    cursor: pointer;
    background: var(--fc-surface);
    border: 2px solid;
    display: grid;
    place-items: center;
    padding: 0;
  }
  .thumb.up {
    border-color: var(--bac-up);
  }
  .thumb.down {
    border-color: var(--bac-down);
  }
  .thumb.up.on {
    background: var(--bac-up);
  }
  .thumb.down.on {
    background: var(--bac-down);
  }
  .thumb:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .n {
    position: absolute;
    right: 3px;
    bottom: 1px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--fc-text);
  }
  .thumb.on .n {
    color: #fff;
  }
  .hint {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--bac-red-ink);
    text-align: center;
  }
  .summary {
    margin-top: 1.2rem;
  }
  .summary p {
    margin: 0.2rem 0;
  }
  .next {
    margin-top: 1rem;
    min-height: 60px;
    font-size: 1.15rem;
  }
</style>
