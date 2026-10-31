"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function portalSetStatus(subscriptionId: string, status: "paused" | "active" | "closed") {
  await requireRole("customer");
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_set_subscription_status", { p_subscription_id: subscriptionId, p_status: status });
  if (error) flash("/portal", "err", error.message);
  revalidatePath("/portal");
  flash("/portal", "ok", status === "active" ? "Subscription resumed." : `Subscription ${status}.`);
}

export async function portalRenew(subscriptionId: string) {
  await requireRole("customer");
  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_subscription", { p_subscription_id: subscriptionId });
  if (error) flash("/portal", "err", error.message);
  revalidatePath("/portal");
  flash("/portal", "ok", "Subscription renewed for another period.");
}

export async function portalPay(invoiceId: string, form: FormData) {
  await requireRole("customer");
  const supabase = await createClient();
  const back = `/portal/invoices/${invoiceId}`;
  const { error } = await supabase.rpc("portal_pay_invoice", { p_invoice_id: invoiceId, p_method: String(form.get("method") ?? "card") });
  if (error) flash(back, "err", error.message);
  revalidatePath("/portal/invoices");
  flash(back, "ok", "Payment received. Thank you!");
}
