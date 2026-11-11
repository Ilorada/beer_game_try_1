// Lecture des quiz déjà existants dans les supports, sans IA.
//
// Formats reconnus (souples) :
//
//   1. Quelle est la définition du lead time ?        (ou "Q1 :", "Question 3 -", ...)
//   A) Le délai entre commande et livraison
//   B) Le temps de production
//   *C) ...            <- un astérisque, (x), [x] ou ✓ marque la bonne réponse
//   Réponse : A         (ou "Bonne réponse : A", "Answer: A", "Corrigé : a")
//   Explication : ...   (facultatif)
//
// Également : JSON (tableau d'objets {question, choices, answer, explanation, topic})
// et CSV (question;choix A;choix B;choix C;choix D;bonne réponse;explication;thème).

const QUESTION_RE = /^\s*(?:(?:q(?:uestion)?\s*)?(\d{1,4})\s*[).:\-–]|q(?:uestion)?\s*(\d{1,4})?\s*[:\-–])\s*(.*)$/i;
const CHOICE_RE = /^\s*(\*|\(x\)|\[x\]|✓|✔)?\s*[([]?([a-hA-H])[).\]:]\s+(.*?)\s*(\*|\(x\)|\[x\]|✓|✔)?\s*$/;
const ANSWER_RE = /^\s*(?:bonnes?\s+r[ée]ponses?|r[ée]ponses?(?:\s+correcte)?|corrig[ée]|solution|answer|correct(?:\s+answer)?)\s*[:\-–=]\s*\(?([a-hA-H])\b\)?(.*)$/i;
const EXPLAIN_RE = /^\s*(?:explications?|justification|commentaire|explanation)\s*[:\-–]\s*(.*)$/i;
const TOPIC_RE = /^\s*(?:th[èe]me|chapitre|topic|section)\s*[:\-–]\s*(.*)$/i;

const letterIndex = (l) => l.toUpperCase().charCodeAt(0) - 65;

export function parseQuizText(text, { sourceId = null, defaultTopic = "Général" } = {}) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return parseQuizJson(JSON.parse(trimmed), { sourceId, defaultTopic });
    } catch {
      /* pas du JSON valide : on continue en texte */
    }
  }
  if (looksLikeCsv(trimmed)) return parseQuizCsv(trimmed, { sourceId, defaultTopic });

  const lines = text.replace(/\r/g, "").split("\n");
  const out = [];
  let topic = defaultTopic;
  let cur = null;
  let lastField = null;

  const finish = () => {
    if (cur && cur.choices.length >= 2 && cur.answer !== null && cur.answer < cur.choices.length) {
      out.push({
        sourceId,
        question: cur.question.trim(),
        choices: cur.choices,
        answer: cur.answer,
        explanation: cur.explanation.trim(),
        topic: cur.topic,
        origin: "import",
      });
    }
    cur = null;
    lastField = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const t = line.match(TOPIC_RE);
    if (t && (!cur || cur.answer !== null)) {
      finish();
      topic = t[1].trim() || defaultTopic;
      continue;
    }

    const a = line.match(ANSWER_RE);
    if (a && cur) {
      cur.answer = letterIndex(a[1]);
      const rest = a[2].replace(/^[\s).:\-–]+/, "").trim();
      if (rest) cur.explanation += rest + " ";
      lastField = "explanation";
      continue;
    }

    const e = line.match(EXPLAIN_RE);
    if (e && cur) {
      cur.explanation += e[1] + " ";
      lastField = "explanation";
      continue;
    }

    const c = line.match(CHOICE_RE);
    if (c && cur && letterIndex(c[2]) === cur.choices.length && cur.answer === null) {
      cur.choices.push(c[3].trim());
      if (c[1] || c[4]) cur.marked = cur.choices.length - 1;
      lastField = "choice";
      continue;
    }

    const q = line.match(QUESTION_RE);
    if (q && q[3].trim()) {
      if (cur && cur.answer === null && cur.marked !== undefined) cur.answer = cur.marked;
      finish();
      cur = { question: q[3].trim(), choices: [], answer: null, explanation: "", topic };
      lastField = "question";
      continue;
    }

    // Ligne de continuation.
    if (cur) {
      if (lastField === "question" && cur.choices.length === 0) cur.question += " " + line.trim();
      else if (lastField === "choice") cur.choices[cur.choices.length - 1] += " " + line.trim();
      else if (lastField === "explanation") cur.explanation += line.trim() + " ";
    }
  }
  if (cur && cur.answer === null && cur.marked !== undefined) cur.answer = cur.marked;
  finish();
  return out;
}

function parseQuizJson(data, { sourceId, defaultTopic }) {
  const list = Array.isArray(data) ? data : data.questions || [];
  return list
    .map((q) => {
      const choices = q.choices || q.options || q.propositions || [];
      let answer = q.answer ?? q.correct ?? q.reponse;
      if (typeof answer === "string") {
        answer = /^[a-h]$/i.test(answer.trim()) ? letterIndex(answer.trim()) : choices.indexOf(answer);
      }
      return {
        sourceId,
        question: q.question || q.enonce,
        choices,
        answer,
        explanation: q.explanation || q.explication || "",
        topic: q.topic || q.theme || defaultTopic,
        difficulty: q.difficulty,
        origin: "import",
      };
    })
    .filter((q) => q.question && q.choices.length >= 2 && q.answer >= 0);
}

function looksLikeCsv(text) {
  const first = text.split("\n")[0];
  return (first.match(/;/g) || []).length >= 4 && /question/i.test(first);
}

function parseQuizCsv(text, { sourceId, defaultTopic }) {
  const [header, ...rows] = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const cols = header.split(";").map((h) => h.trim().toLowerCase());
  const idx = (re) => cols.findIndex((c) => re.test(c));
  const qi = idx(/question/);
  const ai = idx(/r[ée]ponse|answer|correct/);
  const ei = idx(/explic/);
  const ti = idx(/th[èe]me|topic|chapitre/);
  const choiceCols = cols.map((c, i) => (/^(choix|option|proposition)|^[a-h]$/.test(c) ? i : -1)).filter((i) => i >= 0);
  return rows
    .map((r) => {
      const f = r.split(";").map((x) => x.trim());
      const choices = choiceCols.map((i) => f[i]).filter(Boolean);
      const raw = f[ai] || "";
      const answer = /^[a-h]$/i.test(raw) ? letterIndex(raw) : choices.indexOf(raw);
      return {
        sourceId,
        question: f[qi],
        choices,
        answer,
        explanation: ei >= 0 ? f[ei] : "",
        topic: (ti >= 0 && f[ti]) || defaultTopic,
        origin: "import",
      };
    })
    .filter((q) => q.question && q.choices.length >= 2 && q.answer >= 0);
}
