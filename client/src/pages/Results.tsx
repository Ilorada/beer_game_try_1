import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ROLE_LABELS, ROLE_ORDER } from "../types";
import type { FinalResults, RoleId, RoomSnapshot } from "../types";

const ROLE_COLOR: Record<RoleId, string> = {
  retailer: "#4cc38a",
  wholesaler: "#5b9cf6",
  distributor: "#c08bf7",
  factory: "#f2a900",
};

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
}

export default function Results({ room, results }: { room: RoomSnapshot; results: FinalResults }) {
  const weeks = results.customerDemand.length;
  const orderChartData = Array.from({ length: weeks }, (_, i) => {
    const week = i + 1;
    const point: Record<string, number> = { week, "Demande client": results.customerDemand[i] };
    for (const role of ROLE_ORDER) {
      point[ROLE_LABELS[role]] = results.roles[role].history[i]?.orderPlaced ?? 0;
    }
    return point;
  });

  const inventoryChartData = Array.from({ length: weeks }, (_, i) => {
    const week = i + 1;
    const point: Record<string, number> = { week };
    for (const role of ROLE_ORDER) {
      const h = results.roles[role].history[i];
      point[ROLE_LABELS[role]] = h ? h.inventory - h.backlog : 0;
    }
    return point;
  });

  const orderVariance = ROLE_ORDER.map((role) => ({
    role,
    variance: variance(results.roles[role].history.map((h) => h.orderPlaced)),
  }));

  const ranked = [...ROLE_ORDER].sort(
    (a, b) => results.roles[a].totalCost - results.roles[b].totalCost
  );

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>🏁 Partie terminée — {results.totalWeeks} semaines</h2>
          <span className="badge">Salle {room.code}</span>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Coût total de l'équipe</div>
            <div className="value">{results.teamTotalCost.toFixed(2)} $</div>
          </div>
          {ROLE_ORDER.map((role) => (
            <div className="stat" key={role}>
              <div className="label">
                <span className="role-dot" style={{ background: ROLE_COLOR[role] }} />
                {ROLE_LABELS[role]} {results.playersByRole[role]?.isBot ? "(ordi)" : ""}
              </div>
              <div className="value">{results.roles[role].totalCost.toFixed(2)} $</div>
            </div>
          ))}
        </div>
        <p style={{ color: "var(--text-dim)" }}>
          Objectif du jeu : minimiser le <strong>coût total de l'équipe</strong> (coût de
          stockage + coût de rupture), pas seulement le vôtre — c'est une chaîne
          d'approvisionnement partagée.
        </p>
      </div>

      <div className="card">
        <h2>📈 L'effet coup de fouet</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Les commandes passées par chaque rôle, semaine par semaine. Remarquez comment de
          petites variations de la demande client s'amplifient en remontant la chaîne jusqu'à
          l'usine.
        </p>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={orderChartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c3348" />
              <XAxis dataKey="week" stroke="#9aa3b8" fontSize={12} />
              <YAxis stroke="#9aa3b8" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "#1e2436", border: "1px solid #2c3348" }}
                labelFormatter={(w) => `Semaine ${w}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Demande client"
                stroke="#eef1f8"
                strokeDasharray="4 4"
                dot={false}
              />
              {ROLE_ORDER.map((role) => (
                <Line
                  key={role}
                  type="monotone"
                  dataKey={ROLE_LABELS[role]}
                  stroke={ROLE_COLOR[role]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          {orderVariance.map(({ role, variance: v }) => (
            <span className="pill" key={role}>
              <span className="role-dot" style={{ background: ROLE_COLOR[role] }} />
              {ROLE_LABELS[role]}: variance {v.toFixed(1)}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>📦 Stock net par rôle</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Stock disponible moins commandes en retard, semaine par semaine. En dessous de zéro,
          le rôle est en rupture et facture du retard à ses clients.
        </p>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={inventoryChartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c3348" />
              <XAxis dataKey="week" stroke="#9aa3b8" fontSize={12} />
              <YAxis stroke="#9aa3b8" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "#1e2436", border: "1px solid #2c3348" }}
                labelFormatter={(w) => `Semaine ${w}`}
              />
              <Legend />
              {ROLE_ORDER.map((role) => (
                <Line
                  key={role}
                  type="monotone"
                  dataKey={ROLE_LABELS[role]}
                  stroke={ROLE_COLOR[role]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Classement (coût individuel)</h2>
        <ul className="player-list">
          {ranked.map((role, i) => (
            <li key={role}>
              <span>#{i + 1}</span>
              <span className="role-dot" style={{ background: ROLE_COLOR[role] }} />
              <span>
                {ROLE_LABELS[role]} — {results.playersByRole[role]?.name ?? "?"}
              </span>
              <span className="badge">{results.roles[role].totalCost.toFixed(2)} $</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
