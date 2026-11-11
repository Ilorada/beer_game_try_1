import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuizText } from "../lib/parser.js";
import { chunkText } from "../lib/extract.js";

test("lit un quiz numéroté avec ligne Réponse", () => {
  const text = `Thème : Gestion des stocks
1. Que mesure le taux de rotation des stocks ?
A) Le nombre de fois où le stock est renouvelé sur une période
B) La valeur du stock en fin d'année
C) Le délai de livraison moyen
D) Le nombre de références
Réponse : A
Explication : rotation = coût des ventes / stock moyen.

2) Quel outil classe les articles selon leur valeur ?
a) MRP
b) La méthode ABC
c) Le kanban
d) Le cross-docking
Bonne réponse : b`;
  const qs = parseQuizText(text);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].answer, 0);
  assert.equal(qs[0].topic, "Gestion des stocks");
  assert.match(qs[0].explanation, /rotation/);
  assert.equal(qs[1].answer, 1);
  assert.equal(qs[1].choices.length, 4);
});

test("reconnaît une bonne réponse marquée par un astérisque", () => {
  const qs = parseQuizText(`Q1 : Le flux tiré est déclenché par…
A) la prévision
*B) la demande réelle du client
C) le fournisseur`);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].answer, 1);
});

test("ignore un cours sans quiz", () => {
  const qs = parseQuizText("La supply chain regroupe l'ensemble des flux physiques, d'information et financiers.\n\nElle va du fournisseur au client final.");
  assert.equal(qs.length, 0);
});

test("lit du JSON et du CSV", () => {
  const json = parseQuizText(JSON.stringify([{ question: "EOQ signifie ?", choices: ["Economic Order Quantity", "End Of Quarter"], answer: "A" }]));
  assert.equal(json.length, 1);
  assert.equal(json[0].answer, 0);
  const csv = parseQuizText("question;choix A;choix B;choix C;choix D;réponse;explication;thème\nQue veut dire VMI ?;Vendor Managed Inventory;Virtual Machine;Value Margin;Volume;A;Stock géré par le fournisseur;Collaboration");
  assert.equal(csv.length, 1);
  assert.equal(csv[0].topic, "Collaboration");
});

test("découpe un long texte en morceaux", () => {
  const para = "x".repeat(5000);
  const chunks = chunkText([para, para, para, para].join("\n\n"), 12000);
  assert.equal(chunks.length, 2);
});
