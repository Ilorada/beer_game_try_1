// Stockage très simple dans un fichier JSON (data/db.json).
// Suffisant pour quelques dizaines de milliers de questions sur un usage personnel.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.QUIZ_DATA_DIR || path.resolve("data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const empty = () => ({ sources: [], questions: [], attempts: [] });

let db = null;
let saveTimer = null;

export function load() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = fs.existsSync(DB_FILE) ? { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) } : empty();
  return db;
}

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}

export function flush() {
  clearTimeout(saveTimer);
  if (!db) return;
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

export const newId = () => crypto.randomUUID();

/** Clé de déduplication : énoncé normalisé (minuscules, sans accents ni ponctuation). */
export function stemKey(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ajoute des questions en ignorant les doublons. Renvoie le nombre réellement ajouté. */
export function addQuestions(list) {
  const d = load();
  const seen = new Set(d.questions.map((q) => stemKey(q.question)));
  let added = 0;
  for (const q of list) {
    const key = stemKey(q.question);
    if (!key || seen.has(key)) continue;
    if (!Array.isArray(q.choices) || q.choices.length < 2) continue;
    if (!(q.answer >= 0 && q.answer < q.choices.length)) continue;
    seen.add(key);
    d.questions.push({
      id: newId(),
      sourceId: q.sourceId ?? null,
      question: String(q.question).trim(),
      choices: q.choices.map((c) => String(c).trim()),
      answer: q.answer,
      explanation: q.explanation ? String(q.explanation).trim() : "",
      topic: q.topic ? String(q.topic).trim() : "Général",
      difficulty: q.difficulty || "moyen",
      origin: q.origin || "import",
      createdAt: Date.now(),
      stats: { seen: 0, wrong: 0 },
    });
    added++;
  }
  save();
  return added;
}
