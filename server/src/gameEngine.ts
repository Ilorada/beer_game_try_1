import {
  DemandPattern,
  GameSettings,
  GameState,
  ROLE_ORDER,
  RoleId,
  RoleState,
  WeekRecord,
} from "./types.js";

export function generateDemand(
  pattern: DemandPattern,
  totalWeeks: number
): number[] {
  const demand: number[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    switch (pattern) {
      case "classic":
        demand.push(w <= 4 ? 4 : 8);
        break;
      case "seasonal":
        demand.push(Math.max(0, Math.round(4 + 3 * Math.sin((2 * Math.PI * w) / 12))));
        break;
      case "random":
      default: {
        const offset = Math.round(Math.random() * 6) - 2; // -2..4
        demand.push(Math.max(0, 4 + offset));
        break;
      }
    }
  }
  return demand;
}

function makeRoleState(role: RoleId, settings: GameSettings): RoleState {
  return {
    role,
    inventory: settings.initialInventory,
    backlog: 0,
    orderPipeline: new Array(settings.orderDelay).fill(settings.initialPipelineRate),
    shipmentPipeline:
      role === "factory" ? [] : new Array(settings.shipDelay).fill(settings.initialPipelineRate),
    totalCost: 0,
    history: [],
    lastIncomingOrder: settings.initialPipelineRate,
  };
}

export function createGameState(settings: GameSettings): GameState {
  const roles = {} as GameState["roles"];
  for (const role of ROLE_ORDER) {
    roles[role] = makeRoleState(role, settings);
  }
  return {
    week: 0,
    phase: "lobby",
    roles,
    customerDemand: generateDemand(settings.demandPattern, settings.totalWeeks),
    pendingOrders: {},
  };
}

/**
 * Advances every role's "current incoming order" for the upcoming week so
 * players can see what they need to react to before they submit an order.
 * Safe to call multiple times for the same week (idempotent on state.week).
 */
export function peekIncomingOrder(state: GameState, role: RoleId): number {
  const idx = ROLE_ORDER.indexOf(role);
  if (role === "retailer") {
    return state.customerDemand[state.week] ?? state.customerDemand.at(-1) ?? 0;
  }
  const customerRole = state.roles[ROLE_ORDER[idx - 1]];
  return customerRole.orderPipeline[0];
}

export function peekIncomingShipment(state: GameState, role: RoleId): number {
  const r = state.roles[role];
  if (role === "factory") return r.orderPipeline[0]; // production completing this week
  return r.shipmentPipeline[0];
}

/** Basic order-up-to heuristic used for computer-controlled seats. */
export function botDecision(state: GameState, role: RoleId, settings: GameSettings): number {
  const r = state.roles[role];
  const incomingOrder = peekIncomingOrder(state, role);
  const netInventory = r.inventory - r.backlog;
  const target = settings.initialInventory;
  const adjustment = Math.round((target - netInventory) / 2);
  return Math.max(0, incomingOrder + adjustment);
}

/**
 * Resolves one full week once every role's order has been submitted.
 * Mutates and returns the state in place (called from room manager after
 * all pendingOrders are collected).
 */
export function resolveWeek(
  state: GameState,
  settings: GameSettings,
  orders: Record<RoleId, number>
): void {
  const week = state.week + 1;

  for (let i = 0; i < ROLE_ORDER.length; i++) {
    const role = ROLE_ORDER[i];
    const r = state.roles[role];

    const incomingOrder = peekIncomingOrder(state, role);
    const shipmentReceived = peekIncomingShipment(state, role);

    // 1. Receive shipment / completed production into inventory.
    r.inventory += shipmentReceived;

    // 2. Fill demand (incoming order + any existing backlog).
    const totalDemand = incomingOrder + r.backlog;
    const shipmentSent = Math.min(r.inventory, totalDemand);
    r.inventory -= shipmentSent;
    r.backlog = totalDemand - shipmentSent;

    // 3. Cost for this week.
    const weekCost = r.inventory * settings.holdingCost + r.backlog * settings.backlogCost;
    r.totalCost += weekCost;

    // 4. Advance pipelines: drop the slot we just consumed.
    if (role === "factory") {
      r.orderPipeline.shift();
    } else {
      r.shipmentPipeline.shift();
    }
    if (i > 0) {
      state.roles[ROLE_ORDER[i - 1]].orderPipeline.shift();
    }

    // 5. Ship downstream: push into the shipment pipeline of the role we supply.
    if (i > 0) {
      state.roles[ROLE_ORDER[i - 1]].shipmentPipeline.push(shipmentSent);
    }
    // (retailer's shipmentSent goes to the end customer and isn't tracked further)

    // 6. Place this role's new order for its own supplier / production run.
    const order = Math.max(0, Math.round(orders[role] ?? 0));
    r.orderPipeline.push(order);

    r.lastIncomingOrder = incomingOrder;

    const record: WeekRecord = {
      week,
      incomingOrder,
      orderPlaced: order,
      shipmentReceived,
      shipmentSent,
      inventory: r.inventory,
      backlog: r.backlog,
      weekCost,
      totalCost: r.totalCost,
    };
    r.history.push(record);
  }

  state.week = week;
  state.pendingOrders = {};
  if (state.week >= settings.totalWeeks) {
    state.phase = "finished";
  }
}
