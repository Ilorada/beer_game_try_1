import "./lib/env.js";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, save, flush, newId, addQuestions } from "./lib/store.js";
import { extractText } from "./lib/extract.js";
import { parseQuizText } from "./lib/parser.js";
import { MODELS, DEFAULT_MODEL, aiAvailable, startGeneration, getJob, listJobs, cancelJob } from "./lib/generator.js";
import { buildSession, publicQuestion, gradeOne, gradeSession, topicStats } from "./lib/sessions.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(here, "public")));

const db = load();

app.get("/api/status", (_req, res) => {
  res.json({
    ai: aiAvailable(),
    models: MODELS,
    defaultModel: DEFAULT_MODEL,
    counts: { sources: db.sources.length, questions: db.questions.length, attempts: db.attempts.filter((a) => a.finishedAt).length },
  });
});

// ---------- Supports ----------
app.get("/api/sources", (_req, res) => {
  res.json(
    db.sources.map(({ text, ...s }) => ({
      ...s,
      questionCount: db.questions.filter((q) => q.sourceId === s.id).length,
    })),
  );
});

app.post("/api/sources", upload.array("files"), async (req, res) => {
  const results = [];
  const items = (req.files || []).map((f) => ({ name: Buffer.from(f.originalname, "latin1").toString("utf8"), buffer: f.buffer }));
  if (req.body.text?.trim()) items.push({ name: req.body.name?.trim() || "Texte collé", buffer: Buffer.from(req.body.text), isText: true });
  if (!items.length) return res.status(400).json({ error: "Ajoute au moins un fichier ou du texte." });

  for (const item of items) {
    try {
      const text = item.isText ? item.buffer.toString("utf8") : await extractText(item.buffer, item.name);
      if (!text.trim()) throw new Error("Aucun texte trouvé (PDF scanné ? Essaie un PDF avec du texte sélectionnable).");
      const source = { id: newId(), name: item.name, text, charCount: text.length, createdAt: Date.now() };
      db.sources.push(source);
      // Si le support contient déjà des QCM, on les importe directement dans la banque.
      const imported = addQuestions(parseQuizText(text, { sourceId: source.id, defaultTopic: path.parse(item.name).name }));
      results.push({ name: item.name, ok: true, id: source.id, chars: text.length, imported });
    } catch (err) {
      results.push({ name: item.name, ok: false, error: err.message });
    }
  }
  save();
  res.json(results);
});

app.delete("/api/sources/:id", (req, res) => {
  const withQuestions = req.query.questions === "1";
  db.sources = db.sources.filter((s) => s.id !== req.params.id);
  if (withQuestions) db.questions = db.questions.filter((q) => q.sourceId !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- Banque de questions ----------
app.get("/api/topics", (_req, res) => res.json(topicStats(db)));

app.get("/api/questions", (req, res) => {
  const { topic, source, q, filter } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  let list = db.questions;
  if (topic) list = list.filter((x) => x.topic === topic);
  if (source) list = list.filter((x) => x.sourceId === source);
  if (filter === "wrong") list = list.filter((x) => x.stats.wrong > 0);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter((x) => x.question.toLowerCase().includes(needle));
  }
  res.json({ total: list.length, items: list.slice(offset, offset + limit) });
});

app.delete("/api/questions/:id", (req, res) => {
  db.questions = db.questions.filter((q) => q.id !== req.params.id);
  save();
  res.json({ ok: true });
});

app.post("/api/questions/import", (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body.questions || [];
  res.json({ imported: addQuestions(list.map((q) => ({ ...q, origin: q.origin || "import" }))) });
});

app.get("/api/export", (_req, res) => {
  res.setHeader("Content-Disposition", 'attachment; filename="banque-quiz-supply-chain.json"');
  res.json(db.questions.map(({ stats, ...q }) => q));
});

// ---------- Génération par IA ----------
app.post("/api/generate", (req, res) => {
  if (!aiAvailable()) return res.status(400).json({ error: "Aucune clé API : définis ANTHROPIC_API_KEY dans le fichier .env puis relance le serveur." });
  const target = Math.max(1, Math.min(Number(req.body.target) || 100, 10000));
  try {
    const job = startGeneration({ sourceIds: req.body.sourceIds || [], target, model: req.body.model, focus: req.body.focus || "" });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/jobs", (_req, res) => res.json(listJobs()));
app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  job ? res.json(job) : res.status(404).json({ error: "Introuvable" });
});
app.post("/api/jobs/:id/cancel", (req, res) => res.json(cancelJob(req.params.id) || {}));

// ---------- Sessions : entraînement, examen blanc, révision ----------
app.post("/api/sessions", (req, res) => {
  try {
    const session = buildSession(db, req.body);
    db.attempts.push(session);
    save();
    res.json({ ...session, items: session.items.map((it) => publicQuestion(db, it)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/sessions/:id/answer", (req, res) => {
  const session = db.attempts.find((a) => a.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  if (session.mode === "exam" && !session.finishedAt) return res.status(400).json({ error: "Pas de correction pendant l'examen." });
  const result = gradeOne(db, session, req.body.questionId, req.body.choice);
  save();
  res.json(result);
});

app.post("/api/sessions/:id/finish", (req, res) => {
  const session = db.attempts.find((a) => a.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const result = gradeSession(db, session, req.body.answers || {});
  save();
  res.json(result);
});

app.get("/api/attempts", (_req, res) => {
  res.json(
    db.attempts
      .filter((a) => a.finishedAt)
      .map(({ items, answers, ...a }) => a)
      .sort((a, b) => b.startedAt - a.startedAt),
  );
});

app.get("/api/attempts/:id", (req, res) => {
  const session = db.attempts.find((a) => a.id === req.params.id);
  if (!session?.finishedAt) return res.status(404).json({ error: "Introuvable" });
  res.json(gradeSession(db, session, session.answers, { readOnly: true }));
});

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Quiz Supply Chain : http://localhost:${port}`);
  console.log(aiAvailable() ? "Génération IA activée." : "Pas de clé ANTHROPIC_API_KEY : import des quiz existants uniquement.");
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
  });
}
