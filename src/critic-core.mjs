export const MIN_CRITIQUE_CHARS = 80
export const MAX_ROUNDS = 1

export function isTrivial(text) {
  return (text || '').trim().length < MIN_CRITIQUE_CHARS
}

export function decideCritique({ stopHookActive, episode, text, gate }) {
  const ep = stopHookActive ? episode : { count: 0 }
  if (isTrivial(text)) return { block: false, nextEpisode: ep }
  if (!gate || gate.unbacked.length === 0) return { block: false, nextEpisode: ep }
  if (ep.count >= MAX_ROUNDS) return { block: false, nextEpisode: ep }
  return { block: true, nextEpisode: { count: ep.count + 1 } }
}

/**
 * Given a decision that wanted to block, and whether the LLM veto confirmed it,
 * return the episode state that should actually be persisted.
 *
 * vetoPassed=true  → veto said PROBLEM (real block): save incremented count
 * vetoPassed=false → veto said OK (false positive): don't consume the round, reset to 0
 */
export function episodeAfterVeto(decision, vetoPassed) {
  if (!decision.block) return decision.nextEpisode
  return vetoPassed ? decision.nextEpisode : { count: 0 }
}
