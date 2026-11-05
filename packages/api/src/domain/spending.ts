/**
 * Deterministic spending math (PRD F01, F06). The model never does billing arithmetic.
 *
 * Rules:
 * - Amounts are integer minor units (cents).
 * - Monthly equivalent: monthly = amount × seats; annual = round(amount × seats ÷ 12); free = 0.
 * - Unknown prices and usage-based plans are never counted as zero. They are counted as unknown.
 * - Archived subscriptions are excluded. Paused ones are excluded from the monthly total.
 * - No currency conversion: amounts in another currency are counted as unknown for this summary.
 */
export const SPEND_CALCULATION_VERSION = "spend-v1";

export interface SubscriptionForSpend {
  id: string;
  price: { known: true; amountMinor: number; currency: string } | { known: false; reason: string };
  cadence: "monthly" | "annual" | "usage_based" | "free";
  seats: number;
  renewalDate: string | null;
  status: "active" | "paused" | "archived";
}

export interface SpendSummary {
  currency: string;
  knownMonthlyEquivalentMinor: number | null;
  unknownPriceCount: number;
  upcomingRenewals: Array<{ subscriptionId: string; renewalDate: string; amount: { amountMinor: number; currency: string } }>;
  calculationVersion: string;
  computedAt: string;
}

/** Monthly equivalent in minor units, or null when it can't be known. */
export function monthlyEquivalentMinor(s: SubscriptionForSpend, currency: string): number | null {
  if (s.cadence === "free") return 0;
  if (!s.price.known || s.price.currency !== currency || s.cadence === "usage_based") return null;
  const total = s.price.amountMinor * s.seats;
  return s.cadence === "annual" ? Math.round(total / 12) : total;
}

/** Amount charged at the next renewal (not the monthly equivalent). */
export function renewalAmountMinor(s: SubscriptionForSpend): number | null {
  if (!s.price.known || s.cadence === "usage_based") return null;
  if (s.cadence === "free") return 0;
  return s.price.amountMinor * s.seats;
}

export function summarizeSpending(
  subs: SubscriptionForSpend[],
  opts: { currency?: string; today: string; renewalWindowDays?: number; now?: Date },
): SpendSummary {
  const currency = opts.currency ?? "USD";
  const window = opts.renewalWindowDays ?? 30;
  const counted = subs.filter((s) => s.status === "active");

  let total = 0;
  let anyKnown = false;
  let unknown = 0;
  for (const s of counted) {
    const m = monthlyEquivalentMinor(s, currency);
    if (m === null) unknown++;
    else { total += m; anyKnown = true; }
  }

  const horizon = addDays(opts.today, window);
  const upcomingRenewals = counted
    .filter((s) => s.renewalDate && s.renewalDate >= opts.today && s.renewalDate <= horizon)
    .flatMap((s) => {
      const amt = renewalAmountMinor(s);
      if (amt === null || !s.price.known) return [];
      return [{ subscriptionId: s.id, renewalDate: s.renewalDate!, amount: { amountMinor: amt, currency: s.price.currency } }];
    })
    .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate));

  return {
    currency,
    knownMonthlyEquivalentMinor: anyKnown ? total : null,
    unknownPriceCount: unknown,
    upcomingRenewals,
    calculationVersion: SPEND_CALCULATION_VERSION,
    computedAt: (opts.now ?? new Date()).toISOString(),
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
