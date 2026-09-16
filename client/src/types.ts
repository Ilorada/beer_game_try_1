// Mirrors the shapes emitted by server/src/types.ts. Kept in sync manually
// since client and server are separate npm packages.

export type RoleId = "retailer" | "wholesaler" | "distributor" | "factory";

export const ROLE_ORDER: RoleId[] = ["retailer", "wholesaler", "distributor", "factory"];

export const ROLE_LABELS: Record<RoleId, string> = {
  retailer: "Détaillant",
  wholesaler: "Grossiste",
  distributor: "Distributeur",
  factory: "Usine",
};

export const ROLE_DESCRIPTIONS: Record<RoleId, string> = {
  retailer: "Vend directement aux clients finaux et commande au grossiste.",
  wholesaler: "Approvisionne le détaillant et commande au distributeur.",
  distributor: "Approvisionne le grossiste et commande à l'usine.",
  factory: "Fabrique la bière sur commande pour approvisionner le distributeur.",
};

export type DemandPattern = "classic" | "random" | "seasonal";

export const DEMAND_PATTERN_LABELS: Record<DemandPattern, string> = {
  classic: "Classique (4 → 8, choc soudain)",
  random: "Aléatoire",
  seasonal: "Saisonnière (vagues)",
};

export interface GameSettings {
  totalWeeks: number;
  demandPattern: DemandPattern;
  orderDelay: number;
  shipDelay: number;
  holdingCost: number;
  backlogCost: number;
  initialInventory: number;
  initialPipelineRate: number;
}

export interface WeekRecord {
  week: number;
  incomingOrder: number;
  orderPlaced: number;
  shipmentReceived: number;
  shipmentSent: number;
  inventory: number;
  backlog: number;
  weekCost: number;
  totalCost: number;
}

export interface RoleState {
  role: RoleId;
  inventory: number;
  backlog: number;
  totalCost: number;
  history: WeekRecord[];
  lastIncomingOrder: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  role: RoleId | null;
  isBot: boolean;
  connected: boolean;
  hasSubmitted: boolean;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: "lobby" | "in_progress" | "finished";
  settings: GameSettings;
  players: PublicPlayer[];
  week: number;
}

export interface MyGameView {
  week: number;
  totalWeeks: number;
  phase: "lobby" | "in_progress" | "finished";
  role: RoleId;
  inventory: number;
  backlog: number;
  incomingOrder: number;
  incomingShipment: number;
  totalCost: number;
  history: WeekRecord[];
  waitingOn: { role: RoleId; name: string; isBot: boolean }[];
  submittedThisWeek: boolean;
}

export interface FinalResults {
  totalWeeks: number;
  settings: GameSettings;
  customerDemand: number[];
  roles: Record<RoleId, RoleState>;
  playersByRole: Partial<Record<RoleId, { name: string; isBot: boolean }>>;
  teamTotalCost: number;
}

export type AckResponse = { ok: true } | { ok: false; error: string };
export type CreateAck = { ok: true; roomCode: string } | { ok: false; error: string };
