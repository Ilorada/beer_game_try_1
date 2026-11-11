const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LETTERS = "ABCDEFGH";
const MODE_LABEL = { practice: "Entraînement", review: "Révision", exam: "Examen blanc" };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 4000);
}

// ---------------- Navigation ----------------
const loaders = { home: loadHome, sources: loadSources, generate: loadGenerate, practice: loadPractice, bank: () => loadBank(true), history: loadHistory };

function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  loaders[view]?.().catch((e) => toast(e.message, true));
  window.scrollTo(0, 0);
}

$("#nav").addEventListener("click", (e) => {
  const view = e.target.dataset?.view;
  if (!view) return;
  if (quiz && !quiz.finished && !confirm("Une série est en cours. La quitter ? (tes réponses sont gardées tant que tu ne relances pas une série)")) return;
  show(view);
});

// ---------------- Accueil ----------------
async function loadHome() {
  const [status, topics, attempts] = await Promise.all([api("/api/status"), api("/api/topics"), api("/api/attempts")]);
  $("#ai-warning").classList.toggle("hidden", status.ai);
  const exams = attempts.filter((a) => a.mode === "exam");
  const last = exams[0];
  $("#home-stats").innerHTML = `
    <div class="card"><b>${status.counts.questions.toLocaleString("fr-FR")}</b><span>questions dans la banque</span></div>
    <div class="card"><b>${status.counts.sources}</b><span>supports importés</span></div>
    <div class="card"><b>${status.counts.attempts}</b><span>séries terminées</span></div>
    <div class="card"><b>${last ? note20(last.score, last.total) : "–"}</b><span>dernier examen blanc (sur 20)</span></div>`;
  const withData = topics.filter((t) => t.seen > 0).sort((a, b) => b.wrong / b.seen - a.wrong / a.seen);
  $("#home-topics").innerHTML = withData.length
    ? withData.slice(0, 8).map((t) => bar(t.topic, 1 - t.wrong / t.seen, `${t.count} questions`)).join("")
    : `<p class="hint">Réponds à quelques questions pour voir tes thèmes à retravailler.</p>`;
  if (savedQuiz()) {
    $("#home-stats").insertAdjacentHTML("afterend", `<div class="notice">Une série est en cours. <button class="primary" id="resume">Reprendre</button></div>`);
    $("#resume").onclick = () => resumeQuiz();
  }
}

const note20 = (score, total) => (total ? ((score / total) * 20).toFixed(1).replace(".", ",") : "–");
function bar(label, ratio, extra = "") {
  const pct = Math.round(ratio * 100);
  const cls = pct >= 70 ? "good" : pct >= 50 ? "mid" : "bad";
  return `<div class="bar"><span class="bar-label">${esc(label)} <small>${esc(extra)}</small></span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div><span class="bar-val">${pct} %</span></div>`;
}

// ---------------- Supports ----------------
async function loadSources() {
  const sources = await api("/api/sources");
  $("#sources-table").innerHTML = sources.length
    ? `<tr><th>Support</th><th>Taille</th><th>Questions</th><th></th></tr>` +
      sources
        .map(
          (s) => `<tr><td>${esc(s.name)}</td><td>${Math.round(s.charCount / 1000)} k caractères</td><td>${s.questionCount}</td>
          <td><button class="ghost small" data-del="${s.id}">Supprimer</button></td></tr>`,
        )
        .join("")
    : `<tr><td class="hint">Aucun support pour l'instant.</td></tr>`;
}

$("#sources-table").addEventListener("click", async (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  const withQ = confirm("Supprimer aussi les questions issues de ce support ?\nOK = oui, Annuler = garder les questions");
  await api(`/api/sources/${id}?questions=${withQ ? 1 : 0}`, { method: "DELETE" });
  loadSources();
});

const drop = $("#drop");
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add("over"))));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  $("#files").files = e.dataTransfer.files;
  updateDropLabel();
});
$("#files").addEventListener("change", updateDropLabel);
function updateDropLabel() {
  const n = $("#files").files.length;
  drop.querySelector("span").innerHTML = n ? `${n} fichier(s) sélectionné(s) :<br><small>${[...$("#files").files].map((f) => esc(f.name)).join(", ")}</small>` : "📄 Clique ou dépose tes fichiers ici";
}

$("#upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Import en cours…";
  try {
    const results = await api("/api/sources", { method: "POST", body: new FormData(e.target) });
    $("#upload-result").innerHTML = results
      .map((r) =>
        r.ok
          ? `<div class="ok">✔ ${esc(r.name)} : ${Math.round(r.chars / 1000)} k caractères${r.imported ? `, <b>${r.imported} questions de quiz importées</b>` : ""}</div>`
          : `<div class="err">✘ ${esc(r.name)} : ${esc(r.error)}</div>`,
      )
      .join("");
    e.target.reset();
    updateDropLabel();
    loadSources();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Importer";
  }
});

// ---------------- Génération ----------------
let jobsTimer = null;
async function loadGenerate() {
  const [status, sources] = await Promise.all([api("/api/status"), api("/api/sources")]);
  $("#gen-model").innerHTML = Object.entries(status.models)
    .map(([id, label]) => `<option value="${id}" ${id === status.defaultModel ? "selected" : ""}>${esc(label)}</option>`)
    .join("");
  $("#gen-sources").innerHTML = sources.length
    ? sources.map((s) => `<label><input type="checkbox" name="sourceIds" value="${s.id}" checked /> ${esc(s.name)}</label>`).join("")
    : `<p class="hint">Importe d'abord des supports dans « Mes supports ».</p>`;
  const btn = $("#gen-form button[type=submit]");
  btn.disabled = !status.ai;
  btn.title = status.ai ? "" : "Clé API manquante";
  pollJobs();
}

async function pollJobs() {
  clearTimeout(jobsTimer);
  const jobs = await api("/api/jobs");
  $("#jobs").innerHTML = jobs.length
    ? jobs
        .map((j) => {
          const pct = Math.min(100, Math.round((j.generated / j.target) * 100));
          return `<div class="panel job">
            <div class="row between"><b>${j.generated.toLocaleString("fr-FR")} / ${j.target.toLocaleString("fr-FR")} questions</b><span class="pill ${j.status === "en cours" ? "run" : j.status === "terminé" ? "done" : "fail"}">${j.status}</span></div>
            <div class="progress"><div style="width:${pct}%"></div></div>
            <small>${esc(j.sources.join(", "))} · ${j.calls} appels · ${Math.round(j.usage.input / 1000)} k jetons lus, ${Math.round(j.usage.output / 1000)} k écrits</small>
            ${j.note ? `<p class="hint">${esc(j.note)}</p>` : ""}
            ${j.errors.length ? `<details><summary>${j.errors.length} erreur(s)</summary><pre>${esc(j.errors.slice(-5).join("\n"))}</pre></details>` : ""}
            ${j.status === "en cours" ? `<button class="ghost small" data-cancel="${j.id}">Arrêter</button>` : ""}
          </div>`;
        })
        .join("")
    : `<p class="hint">Aucune génération lancée.</p>`;
  if (jobs.some((j) => j.status === "en cours") && $("#view-generate").classList.contains("active")) jobsTimer = setTimeout(pollJobs, 2000);
}

$("#jobs").addEventListener("click", async (e) => {
  if (e.target.dataset.cancel) {
    await api(`/api/jobs/${e.target.dataset.cancel}/cancel`, { method: "POST" });
    pollJobs();
  }
});

$("#gen-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api("/api/generate", {
      method: "POST",
      body: { sourceIds: f.getAll("sourceIds"), target: Number(f.get("target")), model: f.get("model"), focus: f.get("focus") },
    });
    toast("Génération lancée !");
    pollJobs();
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------------- Entraînement / examen ----------------
async function loadPractice() {
  const topics = await api("/api/topics");
  $("#practice-topics").innerHTML = topics.length
    ? topics.map((t) => `<label><input type="checkbox" name="topics" value="${esc(t.topic)}" /> ${esc(t.topic)} <small>(${t.count})</small></label>`).join("")
    : `<p class="hint">La banque est vide.</p>`;
}

$("#practice-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  startQuiz({ mode: f.get("mode"), count: Number(f.get("count")), topics: f.getAll("topics") });
});

$("#exam-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  startQuiz({ mode: "exam", count: Number(f.get("count")), durationMin: Number(f.get("durationMin")) });
});
$("#exam-form").addEventListener("input", (e) => {
  const f = new FormData(e.currentTarget);
  const per = (Number(f.get("durationMin")) * 60) / Math.max(1, Number(f.get("count")));
  e.currentTarget.querySelector(".hint").textContent = `Soit ${Math.floor(per / 60)} min ${Math.round(per % 60)} s par question.`;
});

let quiz = null;
let timerHandle = null;
const STORE_KEY = "quiz-en-cours";
const savedQuiz = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY));
  } catch {
    return null;
  }
};
const persist = () => quiz && !quiz.finished && localStorage.setItem(STORE_KEY, JSON.stringify(quiz));

async function startQuiz(params) {
  try {
    const session = await api("/api/sessions", { method: "POST", body: params });
    if (params.mode === "exam" && session.items.length < params.count) toast(`La banque ne contient que ${session.items.length} questions pour l'instant.`);
    quiz = { session, idx: 0, answers: {}, feedback: {}, flags: {}, finished: false };
    persist();
    openQuiz();
  } catch (err) {
    toast(err.message, true);
  }
}

function resumeQuiz() {
  quiz = savedQuiz();
  if (quiz) openQuiz();
}

function openQuiz() {
  const exam = quiz.session.mode === "exam";
  $("#quiz-timer").classList.toggle("hidden", !exam);
  $("#quiz-grid").classList.toggle("hidden", !exam);
  clearInterval(timerHandle);
  if (exam) {
    timerHandle = setInterval(tick, 1000);
    tick();
  }
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-quiz"));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.remove("active"));
  renderQuestion();
}

function tick() {
  const left = quiz.session.durationSec - Math.floor((Date.now() - quiz.session.startedAt) / 1000);
  if (left <= 0) {
    clearInterval(timerHandle);
    toast("Temps écoulé ! Correction de ta copie.");
    return finishQuiz();
  }
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  $("#quiz-timer").textContent = `⏱ ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  $("#quiz-timer").classList.toggle("urgent", left < 600);
}

function renderQuestion() {
  const { session, idx } = quiz;
  const item = session.items[idx];
  const exam = session.mode === "exam";
  const answeredCount = Object.keys(quiz.answers).length;
  $("#quiz-progress").textContent = `${MODE_LABEL[session.mode]} · question ${idx + 1} / ${session.items.length} · ${answeredCount} répondue(s)`;
  $("#quiz-progress-bar").style.width = `${(answeredCount / session.items.length) * 100}%`;
  $("#q-meta").innerHTML = `<span class="pill">${esc(item.topic)}</span>${item.difficulty ? `<span class="pill light">${esc(item.difficulty)}</span>` : ""}`;
  $("#q-text").textContent = item.question;

  const fb = quiz.feedback[item.questionId];
  const chosen = quiz.answers[item.questionId];
  $("#q-choices").innerHTML = item.choices
    .map((c, i) => {
      let cls = "choice";
      if (chosen === i) cls += " selected";
      if (fb) cls += i === fb.correctChoice ? " right" : chosen === i ? " wrong" : "";
      return `<button class="${cls}" data-i="${i}" ${fb ? "disabled" : ""}><b>${LETTERS[i]}</b><span>${esc(c)}</span></button>`;
    })
    .join("");

  const feedback = $("#q-feedback");
  if (fb) {
    feedback.className = "feedback " + (fb.correct ? "good" : "bad");
    feedback.innerHTML = `<b>${fb.correct ? "✔ Bonne réponse" : `✘ La bonne réponse était ${LETTERS[fb.correctChoice]}`}</b>${fb.explanation ? `<p>${esc(fb.explanation)}</p>` : ""}`;
  } else feedback.className = "feedback hidden";

  $("#q-flag").checked = !!quiz.flags[item.questionId];
  $("#q-prev").disabled = idx === 0;
  $("#q-next").textContent = idx === session.items.length - 1 ? (exam ? "Rendre la copie" : "Voir le bilan") : "Suivante →";

  if (exam) {
    $("#quiz-grid").innerHTML = session.items
      .map((it, i) => `<button data-go="${i}" class="${i === idx ? "current" : ""} ${it.questionId in quiz.answers ? "done" : ""} ${quiz.flags[it.questionId] ? "flagged" : ""}">${i + 1}</button>`)
      .join("");
  }
}

$("#q-choices").addEventListener("click", async (e) => {
  const btn = e.target.closest(".choice");
  if (!btn || btn.disabled) return;
  const item = quiz.session.items[quiz.idx];
  const choice = Number(btn.dataset.i);
  quiz.answers[item.questionId] = choice;
  if (quiz.session.mode !== "exam") {
    try {
      quiz.feedback[item.questionId] = await api(`/api/sessions/${quiz.session.id}/answer`, { method: "POST", body: { questionId: item.questionId, choice } });
    } catch (err) {
      toast(err.message, true);
    }
  }
  persist();
  renderQuestion();
});

$("#quiz-grid").addEventListener("click", (e) => {
  if (e.target.dataset.go === undefined) return;
  quiz.idx = Number(e.target.dataset.go);
  persist();
  renderQuestion();
});
$("#q-flag").addEventListener("change", (e) => {
  quiz.flags[quiz.session.items[quiz.idx].questionId] = e.target.checked;
  persist();
  renderQuestion();
});
$("#q-prev").addEventListener("click", () => {
  quiz.idx = Math.max(0, quiz.idx - 1);
  persist();
  renderQuestion();
});
$("#q-next").addEventListener("click", () => {
  if (quiz.idx < quiz.session.items.length - 1) {
    quiz.idx++;
    persist();
    renderQuestion();
    return;
  }
  const missing = quiz.session.items.length - Object.keys(quiz.answers).length;
  if (quiz.session.mode === "exam" && !confirm(missing ? `Il reste ${missing} question(s) sans réponse. Rendre la copie quand même ?` : "Rendre la copie ?")) return;
  finishQuiz();
});
$("#quiz-quit").addEventListener("click", () => {
  if (confirm("Terminer la série maintenant et voir la correction ?")) finishQuiz();
});

document.addEventListener("keydown", (e) => {
  if (!$("#view-quiz").classList.contains("active") || e.target.matches("input, textarea")) return;
  const i = "abcdefgh".indexOf(e.key.toLowerCase());
  const n = "12345678".indexOf(e.key);
  const k = i >= 0 ? i : n;
  if (k >= 0) $(`#q-choices .choice[data-i="${k}"]`)?.click();
  else if (e.key === "ArrowRight" || e.key === "Enter") $("#q-next").click();
  else if (e.key === "ArrowLeft") $("#q-prev").click();
});

async function finishQuiz() {
  clearInterval(timerHandle);
  try {
    const result = await api(`/api/sessions/${quiz.session.id}/finish`, { method: "POST", body: { answers: quiz.answers } });
    quiz.finished = true;
    localStorage.removeItem(STORE_KEY);
    renderResult(result, quiz.flags);
  } catch (err) {
    toast(err.message, true);
  }
}

function renderResult(r, flags = {}) {
  const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
  const minutes = r.finishedAt ? Math.round((r.finishedAt - r.startedAt) / 60000) : 0;
  const wrong = r.details.filter((d) => !d.correct);
  $("#result").innerHTML = `
    <h1>${MODE_LABEL[r.mode]} terminé</h1>
    <div class="cards">
      <div class="card big ${pct >= 70 ? "good" : pct >= 50 ? "mid" : "bad"}"><b>${note20(r.score, r.total)} / 20</b><span>${r.score} bonnes réponses sur ${r.total} (${pct} %)</span></div>
      <div class="card"><b>${minutes} min</b><span>temps passé</span></div>
      <div class="card"><b>${wrong.length}</b><span>erreurs ou sans réponse</span></div>
    </div>
    <h2>Par thème</h2>
    ${Object.entries(r.byTopic).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total).map(([t, v]) => bar(t, v.correct / v.total, `${v.correct}/${v.total}`)).join("")}
    <div class="row"><button class="primary" id="redo-wrong">Réviser mes erreurs</button><button class="ghost" id="to-home">Retour à l'accueil</button></div>
    <h2>Correction</h2>
    <label class="flag"><input type="checkbox" id="only-wrong" checked /> Afficher seulement les erreurs</label>
    <div id="corrections">${r.details.map((d, i) => correctionCard(d, i, flags)).join("")}</div>`;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-result"));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.remove("active"));
  const toggle = () => document.querySelectorAll("#corrections .corr.right").forEach((el) => el.classList.toggle("hidden", $("#only-wrong").checked));
  $("#only-wrong").onchange = toggle;
  toggle();
  $("#redo-wrong").onclick = () => startQuiz({ mode: "review", count: 20 });
  $("#to-home").onclick = () => show("home");
  window.scrollTo(0, 0);
}

function correctionCard(d, i, flags) {
  return `<div class="corr panel ${d.correct ? "right" : "wrong"}">
    <div class="meta"><b>Q${i + 1}</b> <span class="pill">${esc(d.topic)}</span> ${flags[d.questionId] ? '<span class="pill light">à revoir</span>' : ""} ${d.correct ? "✔" : d.choice == null ? "— sans réponse" : "✘"}</div>
    <p class="q">${esc(d.question)}</p>
    <ul>${d.choices.map((c, j) => `<li class="${j === d.correctChoice ? "right" : j === d.choice ? "wrong" : ""}"><b>${LETTERS[j]}</b> ${esc(c)}</li>`).join("")}</ul>
    ${d.explanation ? `<p class="expl">💡 ${esc(d.explanation)}</p>` : ""}
  </div>`;
}

// ---------------- Banque ----------------
let bankOffset = 0;
async function loadBank(reset = false) {
  if (reset) {
    bankOffset = 0;
    const topics = await api("/api/topics");
    const sel = $("#bank-topic");
    const cur = sel.value;
    sel.innerHTML = `<option value="">Tous les thèmes</option>` + topics.map((t) => `<option ${t.topic === cur ? "selected" : ""}>${esc(t.topic)}</option>`).join("");
  }
  const qs = new URLSearchParams({ q: $("#bank-search").value, topic: $("#bank-topic").value, filter: $("#bank-filter").value, offset: bankOffset, limit: 50 });
  const { total, items } = await api("/api/questions?" + qs);
  $("#bank-count").textContent = `${total.toLocaleString("fr-FR")} question(s)`;
  const html = items
    .map(
      (q) => `<div class="panel bank-q">
      <div class="meta"><span class="pill">${esc(q.topic)}</span><span class="pill light">${esc(q.difficulty)}</span><span class="pill light">${q.origin === "ia" ? "générée" : "importée"}</span>
      ${q.stats.seen ? `<small>${q.stats.seen} vue(s), ${q.stats.wrong} erreur(s) en cours</small>` : ""}
      <button class="ghost small push-right" data-delq="${q.id}">Supprimer</button></div>
      <p class="q">${esc(q.question)}</p>
      <ul>${q.choices.map((c, j) => `<li class="${j === q.answer ? "right" : ""}"><b>${LETTERS[j]}</b> ${esc(c)}</li>`).join("")}</ul>
      ${q.explanation ? `<p class="expl">💡 ${esc(q.explanation)}</p>` : ""}</div>`,
    )
    .join("");
  $("#bank-list").innerHTML = reset ? html : $("#bank-list").innerHTML + html;
  bankOffset += items.length;
  $("#bank-more").classList.toggle("hidden", bankOffset >= total);
}
let searchTimer;
$("#bank-search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadBank(true), 300);
});
$("#bank-topic").addEventListener("change", () => loadBank(true));
$("#bank-filter").addEventListener("change", () => loadBank(true));
$("#bank-more").addEventListener("click", () => loadBank(false));
$("#bank-list").addEventListener("click", async (e) => {
  const id = e.target.dataset.delq;
  if (!id || !confirm("Supprimer cette question ?")) return;
  await api(`/api/questions/${id}`, { method: "DELETE" });
  e.target.closest(".bank-q").remove();
});
$("#bank-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const { imported } = await api("/api/questions/import", { method: "POST", body: data });
    toast(`${imported} question(s) importée(s).`);
    loadBank(true);
  } catch (err) {
    toast("Import impossible : " + err.message, true);
  }
  e.target.value = "";
});

// ---------------- Historique ----------------
async function loadHistory() {
  const attempts = await api("/api/attempts");
  $("#history").innerHTML = attempts.length
    ? `<table class="table"><tr><th>Date</th><th>Mode</th><th>Score</th><th>Note /20</th><th></th></tr>` +
      attempts
        .map(
          (a) => `<tr><td>${new Date(a.startedAt).toLocaleString("fr-FR")}</td><td>${MODE_LABEL[a.mode]}</td><td>${a.score} / ${a.total}</td>
          <td><b>${note20(a.score, a.total)}</b></td><td><button class="ghost small" data-open="${a.id}">Revoir</button></td></tr>`,
        )
        .join("") +
      `</table>`
    : `<p class="hint">Aucune série terminée.</p>`;
}
$("#history").addEventListener("click", async (e) => {
  if (!e.target.dataset.open) return;
  renderResult(await api(`/api/attempts/${e.target.dataset.open}`));
});

show("home");
