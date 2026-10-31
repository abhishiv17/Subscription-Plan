"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { flash, optStr, str } from "@/lib/flash";
import { hasTwoDecimals, linesEditable, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions";
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
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!start || !validDate(start)) flash(back, "err", "Choose a valid start date.");
  if (expiry && !validDate(expiry)) flash(back, "err", "Choose a valid expiry date.");
  const discountId = optStr(form, "discount_id");
  if (discountId) {
    const { data, error } = await supabase.from("discounts").select("id").eq("id", discountId).eq("active", true).eq("scope", "subscription").single();
    if (error || !data) flash(back, "err", "Choose an active subscription discount.");
  }
  if (start && expiry && expiry < start) flash(back, "err", "Expiry date must be on or after start date.");
  if (templateId) {
    const { data: id, error } = await supabase.rpc("create_subscription_from_template", {
      p_template_id: templateId, p_customer_id: customerId,
      p_start_date: start ?? undefined, p_expiry_date: expiry,
      p_discount_id: discountId, p_notes: optStr(form, "notes"), p_plan_id: planId,
    });
    if (error) flash(back, "err", error.message);
    revalidatePath("/subscriptions");
    flash(`/subscriptions/${id}`, "ok", "Draft created from quotation template.");
  }
  if (!planId) flash(back, "err", "Choose a plan or a quotation template that has one.");
  const { data: plan, error: planError } = await supabase.from("plans").select("id").eq("id", planId).eq("active", true).single();
  if (planError || !plan) flash(back, "err", "Choose an active plan.");
  const terms = Number(str(form, "payment_terms_days"));
  if (!str(form, "payment_terms_days") || !Number.isSafeInteger(terms) || terms < 0) flash(back, "err", "Payment terms must be a non-negative whole number of days.");
  const { data: sub, error } = await supabase.from("subscriptions").insert({
    customer_id: customerId, plan_id: planId, discount_id: discountId,
    start_date: start ?? undefined, expiry_date: expiry, payment_terms_days: terms, notes: optStr(form, "notes"),
  }).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/subscriptions");
  redirect(`/subscriptions/${sub.id}?ok=${encodeURIComponent("Subscription created.")}`);
}

export async function saveLine(subscriptionId: string, lineId: string | null, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/subscriptions/${subscriptionId}`;
  const { data: subscription, error: subscriptionError } = await supabase.from("subscriptions").select("status").eq("id", subscriptionId).single();
  if (subscriptionError || !subscription) flash(back, "err", "Subscription not found.");
  if (!linesEditable(subscription.status)) flash(back, "err", "Lines can only be changed while a subscription is draft or quotation.");
  const productId = str(form, "product_id"), variantId = optStr(form, "variant_id");
  const quantity = Number(str(form, "quantity"));
  if (!productId) flash(back, "err", "Choose a product.");
  if (!Number.isFinite(quantity) || quantity <= 0) flash(back, "err", "Quantity must be greater than zero.");
  let current: { product_id: string; tax_id: string | null } | null = null;
  if (lineId) {
    const { data, error } = await supabase.from("subscription_lines").select("product_id, tax_id").eq("id", lineId).eq("subscription_id", subscriptionId).single();
    if (error) flash(back, "err", "Subscription line not found.");
    current = data;
  }
  const { data: product, error: productError } = await supabase.from("products").select("sales_price, tax_id, active").eq("id", productId).single();
  if (productError || !product) flash(back, "err", "Product not found.");
  if (!product.active && current?.product_id !== productId) flash(back, "err", "Choose an active product.");
  let price = Number(product.sales_price);
  if (variantId) {
    const { data: variant, error } = await supabase.from("product_variants").select("extra_price").eq("id", variantId).eq("product_id", productId).single();
    if (error || !variant) flash(back, "err", "The selected variant does not belong to this product.");
    price += Number(variant.extra_price);
  }
  const unitPrice = str(form, "unit_price") === "" ? price : Number(str(form, "unit_price"));
  if (!Number.isFinite(unitPrice) || unitPrice < 0) flash(back, "err", "Price must be non-negative, or empty for the product price.");
  if (!hasTwoDecimals(quantity) || !hasTwoDecimals(unitPrice)) flash(back, "err", "Quantity and price must use at most two decimal places.");
  const taxId = optStr(form, "tax_id") ?? product.tax_id;
  if (taxId) {
    const { data: tax, error } = await supabase.from("taxes").select("active").eq("id", taxId).single();
    if (error || !tax || (!tax.active && taxId !== current?.tax_id && taxId !== product.tax_id)) flash(back, "err", "Choose an active tax rule.");
  }
  const values = { product_id: productId, variant_id: variantId, quantity, unit_price: unitPrice, tax_id: taxId, description: optStr(form, "description") };
  const { error } = lineId
    ? await supabase.from("subscription_lines").update(values).eq("id", lineId).eq("subscription_id", subscriptionId).select("id").single()
    : await supabase.from("subscription_lines").insert({ ...values, subscription_id: subscriptionId });
  if (error) flash(back, "err", error.message);
  revalidatePath("/subscriptions", "layout");
  revalidatePath(`/quotations/${subscriptionId}`);
  flash(back, "ok", lineId ? "Line saved." : "Line added.");
}

export async function removeLine(subscriptionId: string, lineId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/subscriptions/${subscriptionId}`;
  const { data: subscription, error: lookupError } = await supabase.from("subscriptions").select("status").eq("id", subscriptionId).single();
  if (lookupError || !subscription) flash(back, "err", "Subscription not found.");
  if (!linesEditable(subscription.status)) flash(back, "err", "Lines can only be changed while a subscription is draft or quotation.");
  const { error } = await supabase.from("subscription_lines").delete().eq("id", lineId).eq("subscription_id", subscriptionId).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/subscriptions", "layout");
  revalidatePath(`/quotations/${subscriptionId}`);
  flash(back, "ok", "Line removed.");
}

export async function setSubscriptionStatus(subscriptionId: string, status: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  if (!SUBSCRIPTION_STATUSES.includes(status as typeof SUBSCRIPTION_STATUSES[number])) flash(`/subscriptions/${subscriptionId}`, "err", "Choose a valid subscription status.");
  const { error } = await supabase.from("subscriptions").update({ status, ...(status === "draft" ? { quotation_valid_until: null } : {}) }).eq("id", subscriptionId).select("id").single();
  const back = `/subscriptions/${subscriptionId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath("/subscriptions");
  revalidatePath(back);
  revalidatePath(`/quotations/${subscriptionId}`);
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  flash(back, "ok", `Subscription is now ${status}.`);
}

export async function billNow(subscriptionId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bill_subscription_now", { p_subscription_id: subscriptionId });
  const back = `/subscriptions/${subscriptionId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  revalidatePath("/subscriptions");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
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
  revalidatePath("/subscriptions");
  revalidatePath("/portal");
  flash(back, "ok", "Subscription renewed for another period.");
}
