import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSession, gradeSession, gradeOne, pickStratified } from "../lib/sessions.js";

const makeDb = (n) => ({
  sources: [],
  attempts: [],
  questions: Array.from({ length: n }, (_, i) => ({
    id: "q" + i,
    question: "Question " + i,
    choices: ["a", "b", "c", "d"],
    answer: i % 4,
    explanation: "",
    topic: i % 3 === 0 ? "Stocks" : i % 3 === 1 ? "Transport" : "Prévision",
    stats: { seen: 0, wrong: 0 },
  })),
});

test("un examen tire 80 questions distinctes réparties par thème", () => {
  const db = makeDb(300);
  const s = buildSession(db, { mode: "exam", count: 80 });
  assert.equal(s.items.length, 80);
  assert.equal(new Set(s.items.map((i) => i.questionId)).size, 80);
  assert.equal(s.durationSec, 180 * 60);
  const topics = s.items.map((it) => db.questions.find((q) => q.id === it.questionId).topic);
  for (const t of ["Stocks", "Transport", "Prévision"]) assert.ok(topics.filter((x) => x === t).length >= 20);
});

test("la correction tient compte du mélange des propositions", () => {
  const db = makeDb(10);
  const s = buildSession(db, { mode: "exam", count: 10 });
  const answers = {};
  for (const it of s.items) {
    const q = db.questions.find((x) => x.id === it.questionId);
    answers[it.questionId] = it.order.indexOf(q.answer); // toujours juste
  }
  const r = gradeSession(db, s, answers);
  assert.equal(r.score, 10);
  assert.equal(db.questions[0].stats.seen, 1);
});

test("la révision ne reprend que les erreurs", () => {
  const db = makeDb(20);
  const s = buildSession(db, { mode: "practice", count: 5 });
  for (const it of s.items) {
    const q = db.questions.find((x) => x.id === it.questionId);
    gradeOne(db, s, it.questionId, (it.order.indexOf(q.answer) + 1) % 4); // toujours faux
  }
  const review = buildSession(db, { mode: "review", count: 50 });
  assert.equal(review.items.length, 5);
});

test("pickStratified renvoie tout le pool s'il est plus petit", () => {
  assert.equal(pickStratified(makeDb(5).questions, 80).length, 5);
});
