"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { flash, str } from "@/lib/flash";
import { fmtMoney } from "@/lib/format";
import { UUID_RE } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";

const PORTAL_PAY_METHODS = ["card", "upi", "bank_transfer"];

/** Only same-portal paths are accepted as a return location. */
const backTo = (path: string | undefined, fallback: string) =>
  path && /^\/portal(\/[A-Za-z0-9/_-]*)?$/.test(path) ? path : fallback;

function revalidatePortal(subscriptionId?: string) {
  revalidatePath("/portal");
  revalidatePath("/portal/invoices");
  if (subscriptionId) revalidatePath(`/portal/subscriptions/${subscriptionId}`);
}

export async function portalSetStatus(subscriptionId: string, status: "paused" | "active" | "closed", returnTo?: string) {
  await requireRole("customer");
  const back = backTo(returnTo, "/portal");
  if (!UUID_RE.test(subscriptionId) || !["paused", "active", "closed"].includes(status)) flash(back, "err", "Subscription not found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_set_subscription_status", { p_subscription_id: subscriptionId, p_status: status });
  if (error) flash(back, "err", error.message);
  revalidatePortal(subscriptionId);
  flash(back, "ok", { active: "Subscription resumed.", paused: "Subscription paused.", closed: "Subscription cancelled." }[status]);
}

export async function portalRenew(subscriptionId: string, returnTo?: string) {
  await requireRole("customer");
  const back = backTo(returnTo, "/portal");
  if (!UUID_RE.test(subscriptionId)) flash(back, "err", "Subscription not found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_subscription", { p_subscription_id: subscriptionId });
  if (error) flash(back, "err", error.message);
  revalidatePortal(subscriptionId);
  flash(back, "ok", "Subscription renewed for another period.");
}

export async function portalPay(invoiceId: string, form: FormData) {
  await requireRole("customer");
  if (!UUID_RE.test(invoiceId)) flash("/portal/invoices", "err", "Invoice not found.");
  const back = `/portal/invoices/${invoiceId}`;
  const method = str(form, "method") || "card";
  if (!PORTAL_PAY_METHODS.includes(method)) flash(back, "err", "Choose a payment method.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_pay_invoice", { p_invoice_id: invoiceId, p_method: method });
  if (error) flash(back, "err", error.message);
  revalidatePortal();
  revalidatePath(back);
  flash(back, "ok", `Payment of ${fmtMoney(data?.amount)} received. Thank you!`);
}

export async function portalUpdateProfile(form: FormData) {
  await requireRole("customer");
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_update_profile", {
    p_name: str(form, "name"),
    p_phone: str(form, "phone"),
    p_company: str(form, "company"),
    // Form posts send textarea line breaks as CRLF; store plain newlines.
    p_address: str(form, "address").replace(/\r\n?/g, "\n"),
  });
  if (error) flash("/portal/profile", "err", error.message);
  revalidatePath("/portal", "layout");
  flash("/portal/profile", "ok", "Profile saved.");
}
