const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const fmtMoney = (v: number | string | null | undefined) => money.format(Number(v ?? 0));

export const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const titleCase = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Postgres/Supabase errors → a sentence a user can act on. */
export const errMsg = (e: { message?: string } | null | undefined) => e?.message ?? "Something went wrong.";
