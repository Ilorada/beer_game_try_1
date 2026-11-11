// Génération de QCM de supply chain avec Claude, à partir des supports importés.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { chunkText } from "./extract.js";
import { load, addQuestions, newId, stemKey } from "./store.js";

export const MODELS = {
  "claude-opus-5-5": "Claude Opus 5.5 (meilleure qualité)",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 (équilibré)",
  "claude-haiku-5-5": "Claude Haiku 5.5 (le moins cher, le plus rapide)",
};
export const DEFAULT_MODEL = "claude-opus-5-5";
const QUESTIONS_PER_CALL = 25;
const CONCURRENCY = 3;

const QuestionSchema = z.object({
  question: z.string().describe("Énoncé de la question, autonome et sans ambiguïté"),
  choices: z.array(z.string()).describe("Exactement 4 propositions"),
  answer: z.number().int().describe("Index (0 à 3) de la seule bonne proposition"),
  explanation: z.string().describe("Pourquoi c'est la bonne réponse et pourquoi les autres sont fausses (2-4 phrases)"),
  topic: z.string().describe("Thème court de supply chain, ex. 'Gestion des stocks', 'Prévision de la demande'"),
  difficulty: z.enum(["facile", "moyen", "difficile"]),
});
const BatchSchema = z.object({ questions: z.array(QuestionSchema) });

// Chaque appel tourne autour d'un angle différent pour varier les questions
// et pouvoir en produire des milliers sans se répéter.
const ANGLES = [
  "définitions et vocabulaire clés (termes français et anglais)",
  "mises en situation en entreprise : que doit faire le responsable supply chain ?",
  "petits calculs (stock de sécurité, point de commande, quantité économique EOQ/Wilson, taux de service, rotation des stocks, couverture, coûts) avec des valeurs chiffrées",
  "comparaisons entre concepts proches (flux poussé/tiré, MRP/DRP, VMI/CPFR, ABC/XYZ, etc.)",
  "causes et conséquences (effet coup de fouet, ruptures, surstocks, délais)",
  "indicateurs de performance (KPI) : interprétation et choix du bon indicateur",
  "pièges classiques et idées reçues : repérer l'affirmation fausse",
  "ordre des étapes d'un processus et rôle de chaque acteur de la chaîne",
  "questions de synthèse qui croisent plusieurs notions du support",
  "application à un secteur concret (distribution, industrie, e-commerce, santé, agroalimentaire)",
];

let client = null;
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const jobs = new Map();
export const getJob = (id) => jobs.get(id);
export const listJobs = () => [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);

export function cancelJob(id) {
  const job = jobs.get(id);
  if (job && job.status === "en cours") job.cancelled = true;
  return job;
}

/**
 * Lance une génération en arrière-plan. Renvoie tout de suite le job, dont on suit la
 * progression via getJob(id).
 */
export function startGeneration({ sourceIds, target, model = DEFAULT_MODEL, focus = "" }) {
  const db = load();
  const sources = db.sources.filter((s) => sourceIds.includes(s.id));
  if (!sources.length) throw new Error("Aucun support sélectionné.");
  if (!MODELS[model]) throw new Error("Modèle inconnu.");

  const chunks = sources.flatMap((s) => chunkText(s.text).map((text, i) => ({ sourceId: s.id, sourceName: s.name, part: i + 1, text })));
  const job = {
    id: newId(),
    createdAt: Date.now(),
    status: "en cours",
    target,
    generated: 0,
    calls: 0,
    model,
    sources: sources.map((s) => s.name),
    errors: [],
    usage: { input: 0, output: 0, cacheRead: 0 },
    cancelled: false,
  };
  jobs.set(job.id, job);
  run(job, chunks, focus).catch((err) => {
    job.status = "erreur";
    job.errors.push(errorMessage(err));
  });
  return job;
}

async function run(job, chunks, focus) {
  let round = 0;
  let fruitless = 0; // appels consécutifs n'apportant presque rien de neuf
  while (job.generated < job.target && !job.cancelled) {
    const batch = [];
    let remaining = job.target - job.generated;
    for (let i = 0; i < CONCURRENCY; i++) {
      const chunk = chunks[(round * CONCURRENCY + i) % chunks.length];
      const angle = ANGLES[(round * CONCURRENCY + i + Math.floor(round / chunks.length)) % ANGLES.length];
      const wanted = Math.min(QUESTIONS_PER_CALL, remaining);
      if (wanted <= 0) break;
      remaining -= wanted;
      batch.push(generateBatch(job, chunk, angle, wanted, focus));
    }
    round++;
    const results = await Promise.allSettled(batch);
    for (const r of results) {
      if (r.status === "fulfilled") {
        const added = addQuestions(r.value);
        job.generated += added;
        fruitless = added < 3 ? fruitless + 1 : 0;
      } else {
        job.errors.push(errorMessage(r.reason));
        fruitless++;
        if (r.reason instanceof Anthropic.AuthenticationError) {
          job.status = "erreur";
          return;
        }
      }
    }
    if (results.every((r) => r.status === "rejected") && job.errors.length >= 6) {
      job.status = "erreur";
      return;
    }
    if (fruitless >= 12) {
      job.status = "terminé";
      job.note = "Les supports semblent épuisés : ajoute d'autres cours pour obtenir davantage de questions différentes.";
      return;
    }
  }
  job.status = job.cancelled ? "annulé" : "terminé";
}

async function generateBatch(job, chunk, angle, count, focus) {
  const db = load();
  // On montre au modèle les questions déjà tirées de ce passage pour éviter les doublons.
  const existing = db.questions
    .filter((q) => q.sourceId === chunk.sourceId)
    .slice(-150)
    .map((q) => "- " + q.question)
    .join("\n");

  const system = [
    {
      type: "text",
      text:
        "Tu es un enseignant expert en supply chain et en logistique qui prépare des étudiants à un examen de 80 QCM en 3 heures. " +
        "Tu rédiges des questions en français, rigoureuses et fidèles au support de cours fourni. " +
        "Règles : une seule bonne réponse parmi exactement 4 propositions ; des distracteurs plausibles, de longueur comparable, sans « toutes les réponses » ni « aucune » ; " +
        "la bonne réponse doit être répartie au hasard entre les positions 0 à 3 ; chaque question doit se comprendre seule, sans dire « selon le texte » ; " +
        "pour les calculs, donne les données nécessaires et vérifie ton résultat ; l'explication cite la notion du cours qui justifie la réponse. " +
        "Appuie-toi d'abord sur le support ; tu peux compléter avec des connaissances standard de supply chain si elles restent cohérentes avec lui.",
    },
    {
      type: "text",
      text: `SUPPORT : « ${chunk.sourceName} » (partie ${chunk.part})\n\n${chunk.text}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  const prompt =
    `Rédige ${count} nouveaux QCM à partir de ce support.\n` +
    `Angle à privilégier pour ce lot : ${angle}.\n` +
    (focus ? `Consigne de l'étudiant : ${focus}\n` : "") +
    "Mélange les niveaux de difficulté (environ 30 % facile, 50 % moyen, 20 % difficile).\n" +
    (existing ? `\nQuestions déjà posées sur ce support, à ne pas répéter ni reformuler :\n${existing}\n` : "");

  const params = {
    model: job.model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(BatchSchema) },
    system,
    messages: [{ role: "user", content: prompt }],
  };
  // Si le modèle refuse une demande, l'API bascule automatiquement sur un autre modèle.
  if (job.model !== "claude-haiku-5-5") {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  const response = await getClient().beta.messages.parse(params);
  job.calls++;
  job.usage.input += response.usage.input_tokens ?? 0;
  job.usage.output += response.usage.output_tokens ?? 0;
  job.usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;

  if (response.stop_reason === "refusal") throw new Error("Le modèle a refusé ce passage du support.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Réponse illisible (arrêt : ${response.stop_reason}).`);

  return parsed.questions
    .filter((q) => q.choices.length === 4 && q.answer >= 0 && q.answer <= 3)
    .filter((q) => new Set(q.choices.map(stemKey)).size === 4)
    .map((q) => ({ ...q, sourceId: chunk.sourceId, origin: "ia" }));
}

function errorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Clé API Anthropic invalide.";
  if (err instanceof Anthropic.RateLimitError) return "Limite de débit atteinte, réessaie dans un moment.";
  if (err instanceof Anthropic.APIError) return `Erreur API ${err.status} : ${err.message}`;
  return err?.message || String(err);
}
