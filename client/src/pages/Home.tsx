import { useState } from "react";
import type { FormEvent } from "react";
import { socket } from "../socket";
import { DEMAND_PATTERN_LABELS } from "../types";
import type { CreateAck, DemandPattern } from "../types";

const NAME_KEY = "beergame:name";

export default function Home({ onError }: { onError: (msg: string) => void }) {
  const [name, setName] = useState(localStorage.getItem(NAME_KEY) ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [totalWeeks, setTotalWeeks] = useState(24);
  const [demandPattern, setDemandPattern] = useState<DemandPattern>("classic");
  const [busy, setBusy] = useState(false);

  function persistName(n: string) {
    setName(n);
    localStorage.setItem(NAME_KEY, n);
  }

  function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return onError("Entrez votre nom d'abord.");
    setBusy(true);
    socket.emit(
      "room:create",
      { name, settings: { totalWeeks, demandPattern } },
      (res: CreateAck) => {
        setBusy(false);
        if (!res.ok) onError(res.error);
      }
    );
  }

  function joinRoom(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return onError("Entrez votre nom d'abord.");
    if (!joinCode.trim()) return onError("Entrez le code de la salle.");
    setBusy(true);
    socket.emit(
      "room:join",
      { name, roomCode: joinCode.trim().toUpperCase() },
      (res: CreateAck) => {
        setBusy(false);
        if (!res.ok) onError(res.error);
      }
    );
  }

  return (
    <>
      <div className="card">
        <h2>Qui joue ?</h2>
        <div className="field">
          <label htmlFor="name">Votre nom</label>
          <input
            id="name"
            value={name}
            maxLength={40}
            onChange={(e) => persistName(e.target.value)}
            placeholder="ex: Alex"
          />
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Créer une salle</h2>
          <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
            Vous devenez l'hôte. Partagez le code à 3 autres joueurs (ou laissez l'ordinateur
            jouer les rôles restants).
          </p>
          <form onSubmit={createRoom}>
            <div className="field">
              <label htmlFor="weeks">Durée de la partie (semaines)</label>
              <input
                id="weeks"
                type="number"
                min={8}
                max={52}
                value={totalWeeks}
                onChange={(e) => setTotalWeeks(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="pattern">Demande client</label>
              <select
                id="pattern"
                value={demandPattern}
                onChange={(e) => setDemandPattern(e.target.value as DemandPattern)}
              >
                {Object.entries(DEMAND_PATTERN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Créer la salle
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Rejoindre une salle</h2>
          <p style={{ color: "var(--text-dim)", marginTop: 0 }}>
            Demandez le code à 5 lettres à votre hôte.
          </p>
          <form onSubmit={joinRoom}>
            <div className="field">
              <label htmlFor="code">Code de la salle</label>
              <input
                id="code"
                value={joinCode}
                maxLength={5}
                style={{ textTransform: "uppercase", letterSpacing: "0.2em" }}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABCDE"
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Rejoindre
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2>Comment ça marche ?</h2>
        <p>
          Quatre rôles (Détaillant, Grossiste, Distributeur, Usine) forment une chaîne
          d'approvisionnement. Chaque semaine, chaque rôle voit sa commande entrante et son
          stock, puis décide combien commander à son fournisseur — sans voir les stocks des
          autres. Les délais de livraison et de transmission des commandes créent
          naturellement l'<strong>effet coup de fouet</strong> : de petites variations de la
          demande client se transforment en oscillations massives en remontant vers l'usine.
        </p>
      </div>
    </>
  );
}
