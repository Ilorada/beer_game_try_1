// Construction et correction des séries : entraînement, examen blanc, révision des erreurs.
import { newId } from "./store.js";

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Tire `count` questions en respectant le poids de chaque thème et en privilégiant les moins vues. */
export function pickStratified(pool, count) {
  if (pool.length <= count) return shuffle(pool);
  const byTopic = new Map();
  for (const q of shuffle(pool)) {
    if (!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q);
  }
  for (const list of byTopic.values()) list.sort((a, b) => a.stats.seen - b.stats.seen);
  const picked = [];
  const topics = [...byTopic.entries()];
  // Quota proportionnel, au moins 1 par thème tant qu'il y a de la place.
  for (const [, list] of topics) {
    const quota = Math.max(1, Math.round((list.length / pool.length) * count));
    picked.push(...list.splice(0, quota));
  }
  const rest = shuffle(topics.flatMap(([, list]) => list));
  while (picked.length < count && rest.length) picked.push(rest.pop());
  return shuffle(picked.slice(0, count));
}

export function buildSession(db, { mode = "practice", count, topics = [], sourceIds = [], durationMin } = {}) {
  let pool = db.questions;
  if (topics.length) pool = pool.filter((q) => topics.includes(q.topic));
  if (sourceIds.length) pool = pool.filter((q) => sourceIds.includes(q.sourceId));
  if (mode === "review") {
    pool = pool.filter((q) => q.stats.wrong > 0);
    if (!pool.length) throw new Error("Aucune erreur à réviser pour l'instant. Fais d'abord un entraînement ou un examen blanc !");
  }
  if (!pool.length) throw new Error("La banque ne contient aucune question pour cette sélection. Importe ou génère des questions d'abord.");

  const n = Math.max(1, Number(count) || (mode === "exam" ? 80 : 20));
  let chosen;
  if (mode === "review") {
    chosen = [...pool]
      .sort((a, b) => b.stats.wrong / Math.max(1, b.stats.seen) - a.stats.wrong / Math.max(1, a.stats.seen))
      .slice(0, n);
    chosen = shuffle(chosen);
  } else {
    chosen = pickStratified(pool, n);
  }

  return {
    id: newId(),
    mode,
    startedAt: Date.now(),
    finishedAt: null,
    durationSec: mode === "exam" ? Math.round((Number(durationMin) || 180) * 60) : null,
    // Les propositions sont mélangées à chaque série : order[i] = index d'origine.
    items: chosen.map((q) => ({ questionId: q.id, order: shuffle(q.choices.map((_, i) => i)) })),
    answers: {},
  };
}

export function publicQuestion(db, item) {
  const q = db.questions.find((x) => x.id === item.questionId);
  if (!q) return { questionId: item.questionId, question: "(question supprimée)", choices: [], topic: "" };
  return {
    questionId: q.id,
    question: q.question,
    choices: item.order.map((i) => q.choices[i]),
    topic: q.topic,
    difficulty: q.difficulty,
  };
}

function correction(db, item, choice) {
  const q = db.questions.find((x) => x.id === item.questionId);
  if (!q) return null;
  const correctDisplayed = item.order.indexOf(q.answer);
  return {
    questionId: q.id,
    question: q.question,
    choices: item.order.map((i) => q.choices[i]),
    topic: q.topic,
    choice: choice ?? null,
    correctChoice: correctDisplayed,
    correct: choice === correctDisplayed,
    explanation: q.explanation,
  };
}

function record(q, correct) {
  q.stats.seen++;
  if (!correct) q.stats.wrong++;
  else if (q.stats.wrong > 0) q.stats.wrong--; // une bonne réponse « rembourse » une erreur
}

export function gradeOne(db, session, questionId, choice) {
  const item = session.items.find((it) => it.questionId === questionId);
  if (!item) throw new Error("Question hors de cette série.");
  const res = correction(db, item, choice);
  if (!(questionId in session.answers)) {
    session.answers[questionId] = choice;
    const q = db.questions.find((x) => x.id === questionId);
    if (q) record(q, res.correct);
  }
  return res;
}

export function gradeSession(db, session, answers, { readOnly = false } = {}) {
  const first = !session.finishedAt && !readOnly;
  if (first) {
    for (const [qid, choice] of Object.entries(answers)) {
      if (session.mode === "exam" || !(qid in session.answers)) session.answers[qid] = choice;
    }
  }
  const details = session.items.map((it) => correction(db, it, session.answers[it.questionId])).filter(Boolean);
  if (first) {
    if (session.mode === "exam") {
      for (const d of details) {
        const q = db.questions.find((x) => x.id === d.questionId);
        if (q) record(q, d.correct);
      }
    }
    session.finishedAt = Date.now();
    session.score = details.filter((d) => d.correct).length;
    session.total = details.length;
  }
  const byTopic = {};
  for (const d of details) {
    byTopic[d.topic] ??= { total: 0, correct: 0 };
    byTopic[d.topic].total++;
    if (d.correct) byTopic[d.topic].correct++;
  }
  return {
    id: session.id,
    mode: session.mode,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    score: session.score,
    total: session.total,
    byTopic,
    details,
  };
}

export function topicStats(db) {
  const map = {};
  for (const q of db.questions) {
    map[q.topic] ??= { topic: q.topic, count: 0, seen: 0, wrong: 0 };
    map[q.topic].count++;
    map[q.topic].seen += q.stats.seen;
    map[q.topic].wrong += q.stats.wrong;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}
