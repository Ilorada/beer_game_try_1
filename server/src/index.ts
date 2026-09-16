import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { RoomManager } from "./roomManager.js";
import { GameSettings, RoleId, ROLE_ORDER } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN; // e.g. http://localhost:5173 during dev

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN ?? true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN ?? true },
});

const rooms = new RoomManager();

function broadcastRoom(roomCode: string) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  io.to(room.code).emit("room:state", rooms.toSnapshot(room));

  if (room.state.phase === "in_progress") {
    for (const player of Object.values(room.players)) {
      if (player.isBot || !player.connected) continue;
      const view = rooms.toMyGameView(room, player.id);
      if (view) io.to(player.id).emit("game:state", view);
    }
  } else if (room.state.phase === "finished") {
    io.to(room.code).emit("game:ended", rooms.toFinalResults(room));
  }
}

io.on("connection", (socket) => {
  socket.on(
    "room:create",
    (
      payload: { name: string; settings?: Partial<GameSettings> },
      ack?: (res: { ok: true; roomCode: string } | { ok: false; error: string }) => void
    ) => {
      try {
        const name = (payload?.name ?? "").trim().slice(0, 40) || "Hôte";
        const room = rooms.createRoom(socket.id, name, payload?.settings ?? {});
        socket.join(room.code);
        ack?.({ ok: true, roomCode: room.code });
        broadcastRoom(room.code);
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(
    "room:join",
    (
      payload: { roomCode: string; name: string },
      ack?: (res: { ok: true; roomCode: string } | { ok: false; error: string }) => void
    ) => {
      try {
        const name = (payload?.name ?? "").trim().slice(0, 40) || "Joueur";
        const room = rooms.joinRoom(payload.roomCode, socket.id, name);
        socket.join(room.code);
        ack?.({ ok: true, roomCode: room.code });
        broadcastRoom(room.code);
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on(
    "room:chooseRole",
    (payload: { role: RoleId }, ack?: (res: { ok: true } | { ok: false; error: string }) => void) => {
      try {
        const room = rooms.findRoomByPlayer(socket.id);
        if (!room) throw new Error("Vous n'êtes dans aucune salle.");
        if (!ROLE_ORDER.includes(payload.role)) throw new Error("Rôle invalide.");
        rooms.chooseRole(room, socket.id, payload.role);
        ack?.({ ok: true });
        broadcastRoom(room.code);
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on("room:start", (_payload, ack?: (res: { ok: true } | { ok: false; error: string }) => void) => {
    try {
      const room = rooms.findRoomByPlayer(socket.id);
      if (!room) throw new Error("Vous n'êtes dans aucune salle.");
      rooms.startGame(room, socket.id);
      ack?.({ ok: true });
      broadcastRoom(room.code);
    } catch (err) {
      ack?.({ ok: false, error: (err as Error).message });
    }
  });

  socket.on(
    "game:submitOrder",
    (payload: { quantity: number }, ack?: (res: { ok: true } | { ok: false; error: string }) => void) => {
      try {
        const room = rooms.findRoomByPlayer(socket.id);
        if (!room) throw new Error("Vous n'êtes dans aucune salle.");
        rooms.submitOrder(room, socket.id, payload.quantity);
        ack?.({ ok: true });
        broadcastRoom(room.code);
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    }
  );

  socket.on("disconnect", () => {
    const room = rooms.findRoomByPlayer(socket.id);
    if (!room) return;
    rooms.removePlayer(room, socket.id);
    rooms.reassignHost(room);
    rooms.deleteRoomIfEmpty(room);
    if (rooms.getRoom(room.code)) broadcastRoom(room.code);
  });
});

// --- Serve the built client in production so the whole app is one deployable service ---
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Beer Game server listening on port ${PORT}`);
});
