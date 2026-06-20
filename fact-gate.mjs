export const CLAIM_RULES = [
  {
    id: 'tests-pass',
    re: /\btests?\s+(?:pass(?:ed|ing)?|are\s+passing|green)\b|\ball\s+green\b/i,
    backed: (e) => e.ranTests === true,
  },
  {
    id: 'verified',
    re: /\bverified\b|\bconfirmed\s+working\b|\bit\s+works\s+now\b/i,
    backed: (e) => e.ranTests === true || e.readFiles.length > 0,
  },
]

export const TEST_VALIDITY_RULES = [
  {
    id: 'covered-by',
    re: /covered\s+by\s+(\S+\.test\S*)/i,
    backed: (e, m) =>
      [...e.editedFiles, ...e.readFiles].some((f) => f.includes(m[1])),
  },
]

const UNBACKED_EXPLANATIONS = {
  'tests-pass': 'you claimed tests pass, but no passing test run is visible in this turn',
  'verified': 'you claimed the work is verified/working, but there is no supporting evidence (test run or file read) in this turn',
  'covered-by': 'you claimed something is covered by a test file, but that file was not read or edited in this turn',
}

export function explainUnbacked(unbacked) {
  const items = unbacked.map((c) => {
    const explanation = UNBACKED_EXPLANATIONS[c.id]
    if (explanation) return explanation
    return `you made a claim ("${c.match}") without visible evidence`
  })
  return '[self-critic] ' + items.join('; ') + '. Run the check and show the result, or remove the claim.'
}

export function scanTurn(text, evidence) {
  const claims = []
  const unbacked = []
  const t = text || ''

  for (const rule of CLAIM_RULES) {
    const m = t.match(rule.re)
    if (!m) continue
    const c = { id: rule.id, match: m[0] }
    claims.push(c)
    if (!rule.backed(evidence)) unbacked.push(c)
  }

  if (/\btest/i.test(t)) {
    for (const rule of TEST_VALIDITY_RULES) {
      const m = t.match(rule.re)
      if (!m) continue
      const c = { id: rule.id, match: m[0] }
      claims.push(c)
      if (!rule.backed(evidence, m)) unbacked.push(c)
    }
  }

  return { claims, unbacked }
}
