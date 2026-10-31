"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { flash, num, optStr, str } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function createSubscription(form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();

  const templateId = optStr(form, "template_id");
  const back = templateId ? `/subscriptions/new?template=${encodeURIComponent(templateId)}` : "/subscriptions/new";
  const customerId = optStr(form, "customer_id");
  const planId = optStr(form, "plan_id");
  const start = optStr(form, "start_date");
  const expiry = optStr(form, "expiry_date");
  if (!customerId) flash(back, "err", "Choose a customer.");
  if (start && expiry && expiry < start) flash(back, "err", "Expiry date must be on or after start date.");
  if (templateId) {
    const { data: id, error } = await supabase.rpc("create_subscription_from_template", {
      p_template_id: templateId, p_customer_id: customerId,
      p_start_date: start ?? undefined, p_expiry_date: expiry,
      p_discount_id: optStr(form, "discount_id"), p_notes: optStr(form, "notes"), p_plan_id: planId,
    });
    if (error) flash(back, "err", error.message);
    revalidatePath("/subscriptions");
    flash(`/subscriptions/${id}`, "ok", "Draft created from quotation template.");
  }
  if (!planId) flash(back, "err", "Choose a plan or a quotation template that has one.");
  const terms = Number(str(form, "payment_terms_days"));
  if (!str(form, "payment_terms_days") || !Number.isSafeInteger(terms) || terms < 0) flash(back, "err", "Payment terms must be a non-negative whole number of days.");
  const { data: sub, error } = await supabase.from("subscriptions").insert({
    customer_id: customerId, plan_id: planId, discount_id: optStr(form, "discount_id"),
    start_date: start ?? undefined, expiry_date: expiry, payment_terms_days: terms, notes: optStr(form, "notes"),
  }).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/subscriptions");
  redirect(`/subscriptions/${sub.id}?ok=${encodeURIComponent("Subscription created.")}`);
}

export async function addLine(subscriptionId: string, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const [productId, variantId] = str(form, "product").split("|");
  const back = `/subscriptions/${subscriptionId}`;
  if (!productId) flash(back, "err", "Choose a product.");

  const { data: product } = await supabase.from("products").select("sales_price, tax_id").eq("id", productId).single();
  let price = Number(product?.sales_price ?? 0);
  if (variantId) {
    const { data: v } = await supabase.from("product_variants").select("extra_price").eq("id", variantId).single();
    price += Number(v?.extra_price ?? 0);
  }
  const unitPrice = str(form, "unit_price") === "" ? price : num(form, "unit_price");
  const quantity = num(form, "quantity", 1);
  if (quantity <= 0) flash(back, "err", "Quantity must be more than zero.");

  const { error } = await supabase.from("subscription_lines").insert({
    subscription_id: subscriptionId,
    product_id: productId,
    variant_id: variantId || null,
    quantity,
    unit_price: unitPrice,
    tax_id: optStr(form, "tax_id") ?? product?.tax_id ?? null,
  });
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  flash(back, "ok", "Line added.");
}

export async function removeLine(subscriptionId: string, lineId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { error } = await supabase.from("subscription_lines").delete().eq("id", lineId);
  const back = `/subscriptions/${subscriptionId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  flash(back, "ok", "Line removed.");
}

export async function setSubscriptionStatus(subscriptionId: string, status: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { error } = await supabase.from("subscriptions").update({ status }).eq("id", subscriptionId);
  const back = `/subscriptions/${subscriptionId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath("/subscriptions");
  revalidatePath(back);
  flash(back, "ok", `Subscription is now ${status}.`);
}

export async function billNow(subscriptionId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bill_subscription_now", { p_subscription_id: subscriptionId });
  const back = `/subscriptions/${subscriptionId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  if (!data) flash(back, "ok", "That period was already invoiced, so nothing was billed twice. Schedule moved forward.");
  redirect(`/invoices/${data}?ok=${encodeURIComponent("Invoice created from subscription.")}`);
}

export async function renewSubscription(subscriptionId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_subscription", { p_subscription_id: subscriptionId });
  const back = `/subscriptions/${subscriptionId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  flash(back, "ok", "Subscription renewed for another period.");
}
