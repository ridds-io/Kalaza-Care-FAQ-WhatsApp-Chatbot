// ---------------------------------------------------------------------------
// Retrieval logic — ported directly from the browser-based FAQ assistant.
// Simple TF-IDF cosine similarity + a domain synonym map, so a question like
// "what is the cost?" still matches KB entries worded around "charges".
// ---------------------------------------------------------------------------

const SYNONYM_GROUPS = [
  ["cost","costs","price","prices","pricing","fee","fees","charge","charges","charged","rate","rates","expensive","afford","affordable","payment","pay","paying","tariff","budget"],
  ["home","facility","facilities","accommodation","accomodation","accommodations","property","premises"],
  ["stay","staying","stayed","reside","residing","live","living"],
  ["admit","admission","admitting","join","joining","enroll","enrolling","enrol","register","registration","book","booking","onboard"],
  ["senior","seniors","elderly","old","aged","elder","elders"],
  ["doctor","doctors","physician","physicians"],
  ["nurse","nurses","nursing","caretaker","caretakers","caregiver","caregivers","clinical","staff"],
  ["visit","visiting","visits","tour","tours","touring"],
  ["food","meal","meals","diet","diets","dietary","nutrition","eating"],
  ["room","rooms","bed","beds","flat","flats"],
  ["activity","activities","recreation","recreational","engagement","games"],
  ["document","documents","documentation","paperwork","forms","papers"],
  ["patient","patients","resident","residents"],
  ["ambulance","emergency"],
  ["dementia","memory","alzheimer","alzheimers"],
  ["cancer","palliative","terminal","hospice"],
  ["transplant","transplants"],
];

const SYNONYM_INDEX = {};
SYNONYM_GROUPS.forEach(group => {
  group.forEach(word => { SYNONYM_INDEX[word] = group; });
});

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function expandQueryTokens(tokens, localIdf) {
  const expanded = new Set(tokens);
  tokens.forEach(t => {
    const group = SYNONYM_INDEX[t];
    if (group) {
      group.forEach(w => { if (localIdf[w]) expanded.add(w); });
    }
  });
  return Array.from(expanded);
}

function buildIndex(entries) {
  const docs = entries.map(e => tokenize((e.question || "") + " " + (e.answer || "")));
  const df = {};
  docs.forEach(tokens => {
    new Set(tokens).forEach(t => { df[t] = (df[t] || 0) + 1; });
  });
  const N = docs.length || 1;
  const localIdf = {};
  Object.keys(df).forEach(t => { localIdf[t] = Math.log(1 + N / df[t]); });

  const index = docs.map(tokens => {
    const tf = {};
    tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const vec = {};
    let norm = 0;
    Object.keys(tf).forEach(t => {
      const w = tf[t] * (localIdf[t] || 0);
      vec[t] = w;
      norm += w * w;
    });
    return { vec, norm: Math.sqrt(norm) || 1 };
  });

  return { index, idf: localIdf };
}

function scoreQuery(query, index, localIdf) {
  const tokens = expandQueryTokens(tokenize(query), localIdf);
  const tf = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  const qvec = {};
  let qnorm = 0;
  Object.keys(tf).forEach(t => {
    const w = tf[t] * (localIdf[t] || 0.0001);
    qvec[t] = w;
    qnorm += w * w;
  });
  qnorm = Math.sqrt(qnorm) || 1;

  return index
    .map((doc, i) => {
      let dot = 0;
      Object.keys(qvec).forEach(t => {
        if (doc.vec[t]) dot += doc.vec[t] * qvec[t];
      });
      const sim = dot / (doc.norm * qnorm);
      return { i, sim };
    })
    .sort((a, b) => b.sim - a.sim);
}

// Builds a reusable retriever bound to a specific FAQ array.
function createRetriever(kb) {
  const { index, idf } = buildIndex(kb);

  function retrieveTopK(query, k = 8) {
    if (!kb.length) return [];
    const scored = scoreQuery(query, index, idf);
    const strong = scored.filter(s => s.sim > 0.02);

    let selected;
    if (strong.length >= 3) {
      selected = strong.slice(0, k);
    } else if (kb.length <= 60) {
      // Small KB — vague query — just send everything, it's cheap.
      selected = scored.slice(0, kb.length);
    } else {
      selected = scored.slice(0, Math.max(k, 12));
    }

    return selected.map(s => ({ ...kb[s.i], _sim: s.sim, _idx: s.i }));
  }

  return { retrieveTopK };
}

module.exports = { createRetriever };
