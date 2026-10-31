import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lineAmounts, UUID_RE, type SubscriptionStatus } from "@/lib/subscriptions";

export type SubscriptionRecord = {
  id: string; number: string; status: SubscriptionStatus; start_date: string; expiry_date: string | null;
  quotation_valid_until: string | null; payment_terms_days: number; next_invoice_date: string | null; notes: string | null; created_at: string;
  customers: { id: string; name: string; email: string; company: string | null; address: string | null };
  plans: { name: string; billing_period: string; min_quantity: number; auto_close: boolean; pausable: boolean; closable: boolean; renewable: boolean; end_date: string | null };
  quotation_templates: { name: string } | null; discounts: { name: string } | null;
};
export type SubscriptionLine = {
  id: string; product_id: string; variant_id: string | null; quantity: number; unit_price: number;
  tax_id: string | null; amount: number; description: string | null;
  products: { name: string } | null; product_variants: { attribute: string; value: string } | null;
  taxes: { name: string; rate: number } | null;
};
export async function getSubscriptionDetail(id: string) {
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions")
    .select("*, customers(id, name, email, company, address), plans(name, billing_period, min_quantity, auto_close, pausable, closable, renewable, end_date), quotation_templates(name), discounts(name)")
    .eq("id", id).single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (!data) notFound();
  const { data: rows, error: lineError } = await supabase.from("subscription_lines")
    .select("id, product_id, variant_id, quantity, unit_price, tax_id, amount, description, products(name), product_variants(attribute, value), taxes(name, rate)")
    .eq("subscription_id", id).order("id");
  if (lineError) throw new Error(lineError.message);
  const subscription = data as unknown as SubscriptionRecord;
  const lines = (rows ?? []) as unknown as SubscriptionLine[];
  const amounts = lines.map(l => lineAmounts(Number(l.quantity), Number(l.unit_price), Number(l.taxes?.rate ?? 0)));
  const subtotal = amounts.reduce((total, a) => total + a.subtotal, 0);
  const tax = amounts.reduce((total, a) => total + a.tax, 0);
  return { subscription, lines, subtotal, tax, total: subtotal + tax };
}
