// Charge le fichier .env (clé API, port) s'il existe.
import fs from "node:fs";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
