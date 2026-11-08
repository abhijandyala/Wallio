import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyEquivalentMinor, renewalAmountMinor, summarizeSpending, type SubscriptionForSpend } from "../src/domain/spending.ts";

const sub = (over: Partial<SubscriptionForSpend>): SubscriptionForSpend => ({
  id: "s", price: { known: true, amountMinor: 1000, currency: "USD" }, cadence: "monthly", seats: 1, renewalDate: null, status: "active", ...over,
});

test("monthly and annual monthly-equivalents, with seats", () => {
  assert.equal(monthlyEquivalentMinor(sub({}), "USD"), 1000);
  assert.equal(monthlyEquivalentMinor(sub({ seats: 3 }), "USD"), 3000);
  assert.equal(monthlyEquivalentMinor(sub({ cadence: "annual", price: { known: true, amountMinor: 20000, currency: "USD" } }), "USD"), 1667, "200.00/yr → 16.67/mo, rounded");
  assert.equal(monthlyEquivalentMinor(sub({ cadence: "annual", seats: 2, price: { known: true, amountMinor: 12000, currency: "USD" } }), "USD"), 2000);
});

test("annual renewal shows the real charge, not the monthly equivalent", () => {
  assert.equal(renewalAmountMinor(sub({ cadence: "annual", price: { known: true, amountMinor: 20000, currency: "USD" } })), 20000);
});

test("unknown, usage-based and other-currency prices are unknown, never zero", () => {
  assert.equal(monthlyEquivalentMinor(sub({ price: { known: false, reason: "not entered" } }), "USD"), null);
  assert.equal(monthlyEquivalentMinor(sub({ cadence: "usage_based" }), "USD"), null);
  assert.equal(monthlyEquivalentMinor(sub({ price: { known: true, amountMinor: 900, currency: "EUR" } }), "USD"), null, "no silent conversion");
  assert.equal(monthlyEquivalentMinor(sub({ cadence: "free", price: { known: false, reason: "free" } }), "USD"), 0);
});

test("summary totals known, counts unknown, skips paused and archived", () => {
  const s = summarizeSpending(
    [
      sub({ id: "a" }),
      sub({ id: "b", price: { known: true, amountMinor: 2000, currency: "USD" } }),
      sub({ id: "c", cadence: "annual", price: { known: false, reason: "not entered" } }),
      sub({ id: "d", status: "paused" }),
      sub({ id: "e", status: "archived" }),
    ],
    { today: "2026-11-05", now: new Date("2026-11-05T12:00:00Z") },
  );
  assert.equal(s.knownMonthlyEquivalentMinor, 3000);
  assert.equal(s.unknownPriceCount, 1);
  assert.equal(s.calculationVersion, "spend-v1");
});

test("all-unknown gives null total, not 0", () => {
  const s = summarizeSpending([sub({ price: { known: false, reason: "x" } })], { today: "2026-11-05" });
  assert.equal(s.knownMonthlyEquivalentMinor, null);
});

test("upcoming renewals: within 30 days, known amount, sorted", () => {
  const s = summarizeSpending(
    [
      sub({ id: "late", renewalDate: "2026-12-30" }),
      sub({ id: "soon2", renewalDate: "2026-11-28" }),
      sub({ id: "soon1", renewalDate: "2026-11-10" }),
      sub({ id: "past", renewalDate: "2026-11-01" }),
      sub({ id: "unknown", renewalDate: "2026-11-12", price: { known: false, reason: "x" } }),
    ],
    { today: "2026-11-05" },
  );
  assert.deepEqual(s.upcomingRenewals.map((r) => r.subscriptionId), ["soon1", "soon2"]);
});

test("same input gives the same output (deterministic)", () => {
  const input = [sub({ id: "a", cadence: "annual", price: { known: true, amountMinor: 9999, currency: "USD" } })];
  const opts = { today: "2026-11-05", now: new Date("2026-11-05T00:00:00Z") };
  assert.deepEqual(summarizeSpending(input, opts), summarizeSpending(input, opts));
});
