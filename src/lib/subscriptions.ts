export const SUBSCRIPTION_STATUSES = ["draft", "quotation", "confirmed", "active", "paused", "closed"] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const linesEditable = (status: string) => status === "draft" || status === "quotation";
export const hasTwoDecimals = (value: number) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
export function lineAmounts(quantity: number, price: number, rate: number) {
  // Database quantities, prices and rates have two decimal places. Use scaled
  // integers so half-cent subtotals and tax match Postgres numeric rounding.
  const q = BigInt(Math.round(quantity * 100)), p = BigInt(Math.round(price * 100));
  const r = BigInt(Math.round(rate * 100));
  const subtotalCents = (q * p + BigInt(50)) / BigInt(100);
  const taxCents = (subtotalCents * r + BigInt(5000)) / BigInt(10000);
  return { subtotal: Number(subtotalCents) / 100, tax: Number(taxCents) / 100, total: Number(subtotalCents + taxCents) / 100 };
}
export function allowedTransitions(status: string, plan: { pausable: boolean; closable: boolean }, expiry: string | null, today: string) {
  const transitions: Record<string, string[]> = {
    draft: ["quotation", "confirmed", "closed"], quotation: ["draft", "confirmed", "closed"],
    confirmed: ["active", "closed"], active: [], paused: ["active"], closed: [],
  };
  const result = [...(transitions[status] ?? [])];
  if (status === "active" && plan.pausable) result.push("paused");
  if (["active", "paused"].includes(status) && (plan.closable || (expiry !== null && expiry < today))) result.push("closed");
  return result;
}
