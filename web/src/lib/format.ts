// All money is integer minor units (cents), per the PRD data model.
// The UI only formats; the backend owns authoritative arithmetic.

export function formatMoney(cents: number | null, currency = "USD"): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Splits $1,234.56 into ["$1,234", ".56"] so cents can be dimmed. */
export function splitMoney(cents: number, currency = "USD"): [string, string] {
  const s = formatMoney(cents, currency);
  const i = s.lastIndexOf(".");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}

export function formatShortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function daysUntil(iso: string, today: string): number {
  const ms =
    new Date(iso + "T12:00:00").getTime() -
    new Date(today + "T12:00:00").getTime();
  return Math.round(ms / 86_400_000);
}
