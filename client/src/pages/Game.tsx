import { useState } from "react";
import type { FormEvent } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { socket } from "../socket";
import { ROLE_LABELS } from "../types";
import type { AckResponse, MyGameView, RoomSnapshot } from "../types";

export default function Game({
  room,
  myView,
  myId,
  onError,
}: {
  room: RoomSnapshot;
  myView: MyGameView | null;
  myId: string;
  onError: (msg: string) => void;
}) {
  const me = room.players.find((p) => p.id === myId);

  if (!me?.role) {
    return (
      <div className="card">
        <h2>Partie en cours</h2>
        <p>
          Vous n'avez pas de rôle dans cette partie — vous ne pouvez pas participer à cette
          manche. Attendez la fin de la partie pour voir les résultats.
        </p>
      </div>
    );
  }

  if (!myView) {
    return (
      <div className="card">
        <h2>Chargement de votre poste…</h2>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>
            {ROLE_LABELS[myView.role]} — Semaine {myView.week} / {myView.totalWeeks}
          </h2>
          <span className="badge">Salle {room.code}</span>
        </div>

        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat">
            <div className="label">Stock disponible</div>
            <div className="value">{myView.inventory}</div>
          </div>
          <div className="stat">
            <div className="label">Commandes en attente (backlog)</div>
            <div className={`value ${myView.backlog > 0 ? "bad" : "good"}`}>
              {myView.backlog}
            </div>
          </div>
          <div className="stat">
            <div className="label">Commande reçue cette semaine</div>
            <div className="value">{myView.incomingOrder}</div>
          </div>
          <div className="stat">
            <div className="label">Livraison reçue cette semaine</div>
            <div className="value">{myView.incomingShipment}</div>
          </div>
          <div className="stat">
            <div className="label">Coût cumulé</div>
            <div className="value">{myView.totalCost.toFixed(2)} $</div>
          </div>
        </div>

        <OrderForm view={myView} onError={onError} />

        {myView.waitingOn.length > 0 && (
          <div>
            <p style={{ color: "var(--text-dim)", marginBottom: 4 }}>En attente de :</p>
            <div className="waiting-list">
              {myView.waitingOn.map((w) => (
                <span className="pill" key={w.role}>
                  <span className="pulse" /> {ROLE_LABELS[w.role]} ({w.name})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {myView.history.length > 0 && (
        <div className="card">
          <h2>Votre historique</h2>
          <div style={{ width: "100%", height: 220, marginBottom: 20 }}>
            <ResponsiveContainer>
              <LineChart data={myView.history} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c3348" />
                <XAxis dataKey="week" stroke="#9aa3b8" fontSize={12} />
                <YAxis stroke="#9aa3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "#1e2436", border: "1px solid #2c3348" }}
                  labelFormatter={(w) => `Semaine ${w}`}
                />
                <Line type="monotone" dataKey="inventory" name="Stock" stroke="#4cc38a" dot={false} />
                <Line type="monotone" dataKey="backlog" name="Backlog" stroke="#e5534b" dot={false} />
                <Line
                  type="monotone"
                  dataKey="orderPlaced"
                  name="Commande passée"
                  stroke="#f2a900"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sem.</th>
                  <th>Reçu</th>
                  <th>Livré</th>
                  <th>Stock</th>
                  <th>Backlog</th>
                  <th>Commandé</th>
                  <th>Coût sem.</th>
                </tr>
              </thead>
              <tbody>
                {[...myView.history].reverse().map((h) => (
                  <tr key={h.week}>
                    <td>{h.week}</td>
                    <td>{h.shipmentReceived}</td>
                    <td>{h.shipmentSent}</td>
                    <td>{h.inventory}</td>
                    <td>{h.backlog}</td>
                    <td>{h.orderPlaced}</td>
                    <td>{h.weekCost.toFixed(2)} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function OrderForm({
  view,
  onError,
}: {
  view: MyGameView;
  onError: (msg: string) => void;
}) {
  const [quantity, setQuantity] = useState(view.incomingOrder);
  const [submitting, setSubmitting] = useState(false);

  if (view.submittedThisWeek) {
    return (
      <div className="stat" style={{ marginBottom: 20 }}>
        <div className="label">Commande envoyée pour cette semaine</div>
        <div className="value good">✓ en attente des autres</div>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    socket.emit("game:submitOrder", { quantity }, (res: AckResponse) => {
      setSubmitting(false);
      if (!res.ok) onError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="row" style={{ alignItems: "flex-end", marginBottom: 20 }}>
      <div className="field" style={{ maxWidth: 200 }}>
        <label htmlFor="qty">Quantité à commander</label>
        <input
          id="qty"
          type="number"
          min={0}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
        />
      </div>
      <button className="btn" type="submit" disabled={submitting}>
        Valider la commande
      </button>
    </form>
  );
}
