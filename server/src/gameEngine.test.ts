import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, ROLE_ORDER, RoleId } from "./types.js";
import { createGameState, resolveWeek, peekIncomingOrder } from "./gameEngine.js";

// 1. A steady-state game (everyone always orders exactly what they were asked
// for) should stay in equilibrium: no backlog, constant inventory, zero cost
// beyond the tiny holding cost on the starting inventory.
{
  const settings = { ...DEFAULT_SETTINGS, totalWeeks: 10, demandPattern: "classic" as const };
  // Force flat demand so steady-state ordering truly stays flat.
  const state = createGameState({ ...settings });
  state.customerDemand = new Array(10).fill(4);

  for (let w = 0; w < 10; w++) {
    const orders = {} as Record<RoleId, number>;
    for (const role of ROLE_ORDER) orders[role] = peekIncomingOrder(state, role);
    resolveWeek(state, settings, orders);
  }

  for (const role of ROLE_ORDER) {
    const r = state.roles[role];
    assert.equal(r.backlog, 0, `${role} should have no backlog in steady state`);
    assert.equal(r.inventory, settings.initialInventory, `${role} inventory should stay flat`);
  }
  console.log("PASS steady-state equilibrium");
}

// 2. The classic step-demand scenario, played with a naive "order = what I
// just received" policy, should amplify order variance as you move upstream
// (the bullwhip effect) — the textbook result this whole app exists to show.
{
  const settings = { ...DEFAULT_SETTINGS, totalWeeks: 24, demandPattern: "classic" as const };
  const state = createGameState(settings);

  for (let w = 0; w < settings.totalWeeks; w++) {
    const orders = {} as Record<RoleId, number>;
    for (const role of ROLE_ORDER) orders[role] = peekIncomingOrder(state, role);
    resolveWeek(state, settings, orders);
  }

  function variance(xs: number[]): number {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  }

  const variances = ROLE_ORDER.map((role) =>
    variance(state.roles[role].history.map((h) => h.orderPlaced))
  );

  for (let i = 1; i < variances.length; i++) {
    assert.ok(
      variances[i] >= variances[i - 1] - 1e-9,
      `expected order variance to grow (or stay flat) moving upstream from ${ROLE_ORDER[i - 1]} to ${ROLE_ORDER[i]}: ${variances[i - 1]} -> ${variances[i]}`
    );
  }
  assert.ok(
    variances[variances.length - 1] > variances[0],
    "factory order variance should exceed retailer order variance (bullwhip effect)"
  );
  console.log("PASS bullwhip amplification:", ROLE_ORDER.map((r, i) => `${r}=${variances[i].toFixed(2)}`).join(", "));
}

console.log("All gameEngine tests passed.");
