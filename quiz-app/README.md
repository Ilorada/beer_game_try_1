# 📦 Quiz Supply Chain : préparation à l'examen

> **Le plus simple :** utilise la version en ligne, qui s'ouvre dans Claude sans rien installer :
> <https://claude.ai/artifact/8Kcqc6xvkrSyykB4iZTSLD>. Son code est dans `claude-page/index.html`.
> Le reste de ce dossier est la version à installer soi-même sur un ordinateur.

Une application web pour réviser un examen de supply chain de **80 QCM en 3 heures** :

1. **Mes supports** : dépose tes cours et tes anciens quiz (PDF, Word `.docx`, TXT, Markdown, CSV, JSON).
   - Les quiz déjà présents dans un support sont **importés automatiquement** dans la banque.
   - Les cours servent de base pour la génération de nouvelles questions.
2. **Générer** : Claude (l'IA d'Anthropic) rédige des QCM à partir de tes supports, par lots de 25,
   jusqu'à 10 000 questions par lancement. Chaque lot vise un angle différent (définitions, calculs
   de stock de sécurité ou d'EOQ, mises en situation, KPI, pièges…) pour varier les questions. Les
   doublons sont écartés.
3. **S'entraîner** : séries par thème, avec la correction et l'explication après chaque réponse.
4. **Examen blanc** : 80 questions réparties sur tous les thèmes, chronomètre de 3 h, grille de
   navigation, marquage « à revoir », note sur 20 et correction détaillée à la fin. Une recharge de
   la page ne fait pas perdre l'examen en cours.
5. **Révision de mes erreurs** : reprend en priorité les questions ratées.
6. **Banque** : rechercher, filtrer, supprimer, exporter ou importer les questions (JSON).
7. **Historique** : toutes les séries passées, avec leur note et leur correction.

À chaque série, l'ordre des propositions est mélangé : tu ne peux pas retenir « c'est la B ».

## Installation

Il faut [Node.js](https://nodejs.org) 20.12 ou plus récent.

```bash
cd quiz-app
```

```bash
npm install
```

```bash
cp .env.example .env
```

Ouvre `.env` et colle ta clé API Anthropic après `ANTHROPIC_API_KEY=`. Tu peux créer une clé sur
<https://console.anthropic.com/settings/keys>. Sans clé, l'application fonctionne quand même, mais
elle se contente d'importer les quiz qui se trouvent déjà dans tes supports.

```bash
npm start
```

Ouvre ensuite <http://localhost:3000>.

Tes données (supports, questions, résultats) sont enregistrées dans `quiz-app/data/db.json`.

## Format des quiz reconnus à l'import

```text
Thème : Gestion des stocks
1. Que mesure le taux de rotation des stocks ?
A) Le nombre de renouvellements du stock sur une période
B) La valeur du stock en fin d'année
C) Le délai de livraison moyen
D) Le nombre de références
Réponse : A
Explication : rotation = coût des ventes / stock moyen.
```

Variantes acceptées : `Q1 :`, `Question 2 -`, `a)` / `a.`, `Bonne réponse : b`, `Corrigé : C`, ou
un astérisque devant la bonne proposition (`*B) …`). Les formats CSV (séparateur `;`, avec une ligne
d'en-tête `question;choix A;choix B;choix C;choix D;réponse;explication;thème`) et JSON
(`[{ "question", "choices", "answer", "explanation", "topic" }]`) sont aussi reconnus.

## Coût de la génération

Chaque lot de 25 questions correspond à un appel à l'API. Le support est mis en cache entre les
appels, ce qui réduit le coût des lots suivants. L'écran « Générer » affiche les jetons consommés.
Pour générer des milliers de questions à moindre coût, choisis **Claude Haiku 5.5** dans la liste
des modèles. **Claude Opus 5.5** (le modèle par défaut) donne les meilleures questions.

## Tests

```bash
npm test
```
