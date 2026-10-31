import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_METHODS } from "@/lib/constants";
import { UUID_RE } from "@/lib/subscriptions";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A yyyy-mm-dd query parameter that Postgres accepts, or "" when it is missing or malformed. */
export function dateParam(v: unknown): string {
  if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return "";
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : "";
}

export const isPaymentMethod = (v: unknown): v is string => typeof v === "string" && PAYMENT_METHODS.includes(v);

export const uuidParam = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : "");

export const pageParam = (v: unknown) => Math.max(1, Math.min(100000, Math.floor(Number(v) || 1)));

export type InvoiceDiscount = { discount_id: string; name: string; discount_type: "fixed" | "percent"; value: number; scope: string; amount: number };

/**
 * Loads one invoice with its lines, discounts and payments through the caller's session (RLS applies).
 * Customers never see drafts, so `customerView` 404s on them.
 */
export async function getInvoiceDetail(id: string, { customerView = false } = {}) {
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  let invoiceQuery = supabase.from("invoice_overview").select("*").eq("id", id);
  if (customerView) invoiceQuery = invoiceQuery.neq("status", "draft");
  const [inv, lines, payments, discounts] = await Promise.all([
    invoiceQuery.maybeSingle(),
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("description"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date").order("created_at"),
    supabase.rpc("invoice_discount_details", { p_invoice_id: id }),
  ]);
  for (const r of [inv, lines, payments, discounts]) if (r.error) throw new Error(r.error.message);
  if (!inv.data) notFound();
  return {
    invoice: inv.data,
    lines: lines.data ?? [],
    payments: payments.data ?? [],
    discounts: (discounts.data ?? []) as InvoiceDiscount[],
  };
}

export const escapeHtml = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
