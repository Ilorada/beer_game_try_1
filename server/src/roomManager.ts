import { randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  GameSettings,
  MyGameView,
  Player,
  ROLE_LABELS,
  ROLE_ORDER,
  Room,
  RoomSnapshot,
  RoleId,
  FinalResults,
} from "./types.js";
import { botDecision, createGameState, peekIncomingOrder, peekIncomingShipment, resolveWeek } from "./gameEngine.js";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(hostId: string, hostName: string, settingsOverride: Partial<GameSettings>): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const settings: GameSettings = { ...DEFAULT_SETTINGS, ...settingsOverride };
    const room: Room = {
      code,
      hostId,
      createdAt: Date.now(),
      players: {
        [hostId]: { id: hostId, name: hostName, role: null, isBot: false, connected: true },
      },
      settings,
      state: createGameState(settings),
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  findRoomByPlayer(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players[playerId]) return room;
    }
    return undefined;
  }

  joinRoom(code: string, playerId: string, name: string): Room {
    const room = this.getRoom(code);
    if (!room) throw new Error("Salle introuvable.");
    if (room.state.phase !== "lobby") throw new Error("La partie a déjà commencé.");
    room.players[playerId] = { id: playerId, name, role: null, isBot: false, connected: true };
    return room;
  }

  chooseRole(room: Room, playerId: string, role: RoleId): void {
    if (room.state.phase !== "lobby") throw new Error("La partie a déjà commencé.");
    const taken = Object.values(room.players).find((p) => p.role === role && p.id !== playerId);
    if (taken) throw new Error("Ce rôle est déjà pris.");
    const player = room.players[playerId];
    if (!player) throw new Error("Joueur introuvable.");
    player.role = role;
  }

  removePlayer(room: Room, playerId: string): void {
    if (room.state.phase === "lobby") {
      delete room.players[playerId];
    } else {
      const player = room.players[playerId];
      if (player) {
        player.connected = false;
        player.isBot = true; // auto-pilot so the game isn't stuck
      }
    }
  }

  reassignHost(room: Room): void {
    if (room.players[room.hostId]?.connected) return;
    const next = Object.values(room.players).find((p) => p.connected);
    if (next) room.hostId = next.id;
  }

  startGame(room: Room, requesterId: string): void {
    if (requesterId !== room.hostId) throw new Error("Seul l'hôte peut démarrer la partie.");
    if (room.state.phase !== "lobby") throw new Error("La partie a déjà commencé.");

    const humanRoles = Object.values(room.players).filter((p) => p.role);
    if (humanRoles.length === 0) {
      throw new Error("Au moins un joueur doit choisir un rôle avant de démarrer.");
    }

    for (const role of ROLE_ORDER) {
      const claimed = Object.values(room.players).some((p) => p.role === role);
      if (!claimed) {
        const botId = `bot-${role}-${randomUUID().slice(0, 8)}`;
        room.players[botId] = {
          id: botId,
          name: `${ROLE_LABELS[role]} (ordinateur)`,
          role,
          isBot: true,
          connected: true,
        };
      }
    }

    room.state.phase = "in_progress";
    room.state.week = 0;
    this.autoSubmitBots(room);
  }

  private autoSubmitBots(room: Room): void {
    for (const player of Object.values(room.players)) {
      if (player.isBot && player.role && room.state.pendingOrders[player.role] === undefined) {
        room.state.pendingOrders[player.role] = botDecision(room.state, player.role, room.settings);
      }
    }
  }

  submitOrder(room: Room, playerId: string, quantity: number): void {
    const player = room.players[playerId];
    if (!player || !player.role) throw new Error("Vous n'avez pas de rôle dans cette partie.");
    if (room.state.phase !== "in_progress") throw new Error("La partie n'est pas en cours.");
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Quantité invalide.");
    room.state.pendingOrders[player.role] = Math.round(quantity);

    this.maybeResolveWeek(room);
  }

  private maybeResolveWeek(room: Room): void {
    const allSubmitted = ROLE_ORDER.every((r) => room.state.pendingOrders[r] !== undefined);
    if (!allSubmitted) return;

    const orders = room.state.pendingOrders as Record<RoleId, number>;
    resolveWeek(room.state, room.settings, orders);

    if (room.state.phase === "in_progress") {
      this.autoSubmitBots(room);
      // If every remaining seat is a bot, cascade immediately; otherwise wait for humans.
      this.maybeResolveWeek(room);
    }
  }

  toSnapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.state.phase,
      settings: room.settings,
      week: room.state.week,
      players: Object.values(room.players).map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        isBot: p.isBot,
        connected: p.connected,
        hasSubmitted: p.role ? room.state.pendingOrders[p.role] !== undefined : false,
      })),
    };
  }

  toMyGameView(room: Room, playerId: string): MyGameView | null {
    const player = room.players[playerId];
    if (!player || !player.role) return null;
    const role = player.role;
    const r = room.state.roles[role];

    const waitingOn = ROLE_ORDER.filter((rl) => room.state.pendingOrders[rl] === undefined).map(
      (rl) => {
        const p = Object.values(room.players).find((pl) => pl.role === rl);
        return { role: rl, name: p?.name ?? ROLE_LABELS[rl], isBot: p?.isBot ?? false };
      }
    );

    return {
      week: room.state.week + (room.state.phase === "in_progress" ? 1 : 0),
      totalWeeks: room.settings.totalWeeks,
      phase: room.state.phase,
      role,
      inventory: r.inventory,
      backlog: r.backlog,
      incomingOrder: peekIncomingOrder(room.state, role),
      incomingShipment: peekIncomingShipment(room.state, role),
      totalCost: r.totalCost,
      history: r.history,
      waitingOn,
      submittedThisWeek: room.state.pendingOrders[role] !== undefined,
    };
  }

  toFinalResults(room: Room): FinalResults {
    const playersByRole: FinalResults["playersByRole"] = {};
    for (const p of Object.values(room.players)) {
      if (p.role) playersByRole[p.role] = { name: p.name, isBot: p.isBot };
    }
    const teamTotalCost = ROLE_ORDER.reduce((sum, r) => sum + room.state.roles[r].totalCost, 0);
    return {
      totalWeeks: room.settings.totalWeeks,
      settings: room.settings,
      customerDemand: room.state.customerDemand,
      roles: room.state.roles,
      playersByRole,
      teamTotalCost,
    };
  }

  deleteRoomIfEmpty(room: Room): void {
    const anyConnected = Object.values(room.players).some((p) => p.connected && !p.isBot);
    if (!anyConnected) this.rooms.delete(room.code);
  }
}
