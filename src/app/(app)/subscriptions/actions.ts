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
  let planId = optStr(form, "plan_id");
  let terms = num(form, "payment_terms_days", 15);
  let templateLines: { product_id: string; variant_id: string | null; quantity: number; unit_price: number | null; tax_id: string | null }[] = [];

  if (templateId) {
    const { data: tpl } = await supabase
      .from("quotation_templates")
      .select("plan_id, payment_terms_days, quotation_template_lines(product_id, variant_id, quantity, unit_price, tax_id)")
      .eq("id", templateId)
      .single();
    if (tpl) {
      planId = planId ?? tpl.plan_id;
      terms = tpl.payment_terms_days;
      templateLines = tpl.quotation_template_lines;
    }
  }

  if (!optStr(form, "customer_id")) flash("/subscriptions/new", "err", "Choose a customer.");
  if (!planId) flash("/subscriptions/new", "err", "Choose a plan or a quotation template that has one.");

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .insert({
      customer_id: str(form, "customer_id"),
      plan_id: planId,
      template_id: templateId,
      discount_id: optStr(form, "discount_id"),
      start_date: optStr(form, "start_date") ?? undefined,
      expiry_date: optStr(form, "expiry_date"),
      payment_terms_days: terms,
      notes: optStr(form, "notes"),
    })
    .select("id")
    .single();
  if (error) flash("/subscriptions/new", "err", error.message);

  if (templateLines.length) {
    const productIds = templateLines.map((l) => l.product_id);
    const { data: products } = await supabase.from("products").select("id, sales_price, tax_id").in("id", productIds);
    const { data: variants } = await supabase.from("product_variants").select("id, extra_price").in("product_id", productIds);
    const { error: lineErr } = await supabase.from("subscription_lines").insert(
      templateLines.map((l) => {
        const p = products?.find((x) => x.id === l.product_id);
        const v = variants?.find((x) => x.id === l.variant_id);
        return {
          subscription_id: sub.id,
          product_id: l.product_id,
          variant_id: l.variant_id,
          quantity: l.quantity,
          unit_price: l.unit_price ?? Number(p?.sales_price ?? 0) + Number(v?.extra_price ?? 0),
          tax_id: l.tax_id ?? p?.tax_id ?? null,
        };
      }),
    );
    if (lineErr) flash(`/subscriptions/${sub.id}`, "err", lineErr.message);
  }

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
