export type RoleId = "retailer" | "wholesaler" | "distributor" | "factory";

export const ROLE_ORDER: RoleId[] = [
  "retailer",
  "wholesaler",
  "distributor",
  "factory",
];

export const ROLE_LABELS: Record<RoleId, string> = {
  retailer: "Détaillant",
  wholesaler: "Grossiste",
  distributor: "Distributeur",
  factory: "Usine",
};

export type DemandPattern = "classic" | "random" | "seasonal";

export interface GameSettings {
  totalWeeks: number;
  demandPattern: DemandPattern;
  orderDelay: number; // weeks for an order to reach the supplier
  shipDelay: number; // weeks for a shipment to reach the customer
  holdingCost: number; // $ per unit of inventory per week
  backlogCost: number; // $ per unit of backlog per week
  initialInventory: number;
  initialPipelineRate: number; // steady-state orders/shipments before week 1
}

export const DEFAULT_SETTINGS: GameSettings = {
  totalWeeks: 24,
  demandPattern: "classic",
  orderDelay: 2,
  shipDelay: 2,
  holdingCost: 0.5,
  backlogCost: 1,
  initialInventory: 12,
  initialPipelineRate: 4,
};

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
  orderPipeline: number[]; // orders this role placed to its supplier, in transit
  shipmentPipeline: number[]; // shipments/production heading into this role's inventory, in transit
  totalCost: number;
  history: WeekRecord[];
  lastIncomingOrder: number;
}

export interface GameState {
  week: number; // current week being played (1-indexed); 0 before start
  phase: "lobby" | "in_progress" | "finished";
  roles: Record<RoleId, RoleState>;
  customerDemand: number[]; // index 0 => week 1
  pendingOrders: Partial<Record<RoleId, number>>; // submissions for current week
}

export interface Player {
  id: string;
  name: string;
  role: RoleId | null;
  isBot: boolean;
  connected: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  createdAt: number;
  players: Record<string, Player>;
  settings: GameSettings;
  state: GameState;
}

// ---- Per-player visible snapshot (players cannot see other roles' data mid-game) ----
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
  phase: GameState["phase"];
  settings: GameSettings;
  players: PublicPlayer[];
  week: number;
}

export interface MyGameView {
  week: number;
  totalWeeks: number;
  phase: GameState["phase"];
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
