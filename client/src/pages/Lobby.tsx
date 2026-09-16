import { socket } from "../socket";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_ORDER } from "../types";
import type { AckResponse, RoleId, RoomSnapshot } from "../types";

const ROLE_COLOR: Record<RoleId, string> = {
  retailer: "var(--retailer)",
  wholesaler: "var(--wholesaler)",
  distributor: "var(--distributor)",
  factory: "var(--factory)",
};

export default function Lobby({
  room,
  myId,
  onError,
}: {
  room: RoomSnapshot;
  myId: string;
  onError: (msg: string) => void;
}) {
  const me = room.players.find((p) => p.id === myId);
  const isHost = room.hostId === myId;
  const shareUrl = `${window.location.origin}${window.location.pathname}?join=${room.code}`;

  function chooseRole(role: RoleId) {
    socket.emit("room:chooseRole", { role }, (res: AckResponse) => {
      if (!res.ok) onError(res.error);
    });
  }

  function startGame() {
    socket.emit("room:start", {}, (res: AckResponse) => {
      if (!res.ok) onError(res.error);
    });
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
  }

  return (
    <>
      <div className="card">
        <h2>Salle en attente</h2>
        <p style={{ color: "var(--text-dim)" }}>Partagez ce code pour inviter des joueurs :</p>
        <div className="room-code">{room.code}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={copyLink} type="button">
            Copier le lien d'invitation
          </button>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Choisissez votre rôle</h2>
          <div className="role-grid">
            {ROLE_ORDER.map((role) => {
              const takenBy = room.players.find((p) => p.role === role);
              const mine = takenBy?.id === myId;
              return (
                <button
                  key={role}
                  type="button"
                  className={`role-card ${takenBy && !mine ? "taken" : ""} ${mine ? "mine" : ""}`}
                  onClick={() => chooseRole(role)}
                  disabled={!!takenBy && !mine}
                  style={{ textAlign: "left" }}
                >
                  <div>
                    <span className="role-dot" style={{ background: ROLE_COLOR[role] }} />
                    <strong>{ROLE_LABELS[role]}</strong>
                  </div>
                  <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginTop: 6 }}>
                    {ROLE_DESCRIPTIONS[role]}
                  </div>
                  {takenBy && (
                    <div style={{ marginTop: 8 }}>
                      <span className="badge">{mine ? "Vous" : takenBy.name}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 12 }}>
            Les rôles non choisis seront joués par l'ordinateur au démarrage.
          </p>
        </div>

        <div className="card">
          <h2>Joueurs ({room.players.length})</h2>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id}>
                {p.role && (
                  <span className="role-dot" style={{ background: ROLE_COLOR[p.role] }} />
                )}
                <span>{p.id === myId ? `${p.name} (vous)` : p.name}</span>
                {p.role && <span className="badge">{ROLE_LABELS[p.role]}</span>}
                {p.id === room.hostId && <span className="badge host">Hôte</span>}
              </li>
            ))}
          </ul>

          {isHost ? (
            <button className="btn" style={{ marginTop: 16 }} onClick={startGame} type="button">
              Démarrer la partie
            </button>
          ) : (
            <p style={{ color: "var(--text-dim)", marginTop: 16 }}>
              En attente que {room.players.find((p) => p.id === room.hostId)?.name ?? "l'hôte"}{" "}
              démarre la partie…
            </p>
          )}
          {!me?.role && (
            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
              Choisissez un rôle pour pouvoir participer.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Réglages de la partie</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Durée</div>
            <div className="value">{room.settings.totalWeeks} sem.</div>
          </div>
          <div className="stat">
            <div className="label">Délai commande</div>
            <div className="value">{room.settings.orderDelay} sem.</div>
          </div>
          <div className="stat">
            <div className="label">Délai livraison</div>
            <div className="value">{room.settings.shipDelay} sem.</div>
          </div>
          <div className="stat">
            <div className="label">Stock initial</div>
            <div className="value">{room.settings.initialInventory}</div>
          </div>
        </div>
      </div>
    </>
  );
}
