"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { bool, flash, num, optNum, optStr, str } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

// ───────── products & variants (admin) ─────────
function validateNumbers(form: FormData, back: string, keys: string[]) {
  for (const key of keys) {
    const value = Number(str(form, key));
    if (!Number.isFinite(value) || value < 0) flash(back, "err", "Prices and minimums must be valid non-negative numbers.");
  }
}

function validateDates(form: FormData, back: string) {
  const start = str(form, "start_date"), end = str(form, "end_date");
  if (start && end && end < start) flash(back, "err", "End date must be on or after start date.");
}

export async function saveProduct(id: string | null, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const back = id ? `/products/${id}` : "/products";
  if (!str(form, "name")) flash(back, "err", "Product name is required.");
  validateNumbers(form, back, ["sales_price", "cost_price"]);
  const values = {
    name: str(form, "name"),
    product_type: str(form, "product_type"),
    sales_price: num(form, "sales_price"),
    cost_price: num(form, "cost_price"),
    tax_id: optStr(form, "tax_id"),
    notes: optStr(form, "notes"),
    active: id ? bool(form, "active") : true,
  };
  const { data, error } = id
    ? await supabase.from("products").update(values).eq("id", id).select("id").single()
    : await supabase.from("products").insert(values).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/products", "layout");
  redirect(`/products/${data.id}?ok=${encodeURIComponent("Product saved.")}`);
}

export async function addVariant(productId: string, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const back = `/products/${productId}`;
  if (!str(form, "attribute") || !str(form, "value") || !Number.isFinite(Number(str(form, "extra_price")))) flash(back, "err", "Enter an attribute, value and valid extra price.");
  const { error } = await supabase.from("product_variants").insert({
    product_id: productId,
    attribute: str(form, "attribute"),
    value: str(form, "value"),
    extra_price: num(form, "extra_price"),
  });
  if (error) flash(back, "err", error.code === "23505" ? "That variant already exists." : error.message);
  revalidatePath(back);
  flash(back, "ok", "Variant added.");
}

export async function removeVariant(productId: string, variantId: string) {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("product_variants").delete().eq("id", variantId).eq("product_id", productId);
  const back = `/products/${productId}`;
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  flash(back, "ok", "Variant removed.");
}

// ───────── plans (admin) ─────────
export async function savePlan(id: string | null, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const back = id ? `/plans/${id}` : "/plans/new";
  if (!str(form, "name")) flash(back, "err", "Plan name is required.");
  validateNumbers(form, back, ["price", "min_quantity"]);
  if (!Number.isInteger(num(form, "min_quantity")) || num(form, "min_quantity") < 1) flash(back, "err", "Minimum quantity must be a positive whole number.");
  validateDates(form, back);
  const values = {
    name: str(form, "name"),
    price: num(form, "price"),
    billing_period: str(form, "billing_period"),
    min_quantity: Math.max(1, num(form, "min_quantity", 1)),
    start_date: optStr(form, "start_date"),
    end_date: optStr(form, "end_date"),
    auto_close: bool(form, "auto_close"),
    closable: bool(form, "closable"),
    pausable: bool(form, "pausable"),
    renewable: bool(form, "renewable"),
    notes: optStr(form, "notes"),
    active: id ? bool(form, "active") : true,
  };
  const { error } = id
    ? await supabase.from("plans").update(values).eq("id", id).select("id").single()
    : await supabase.from("plans").insert(values);
  if (error) flash(back, "err", error.message);
  revalidatePath("/plans", "layout");
  flash("/plans", "ok", `Plan "${values.name}" saved.`);
}

// ───────── taxes (admin) ─────────
export async function saveTax(id: string | null, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const rate = num(form, "rate", -1);
  if (!str(form, "name") || rate < 0 || rate > 100) flash("/taxes", "err", "Enter a name and a rate between 0 and 100.");
  const values = { name: str(form, "name"), rate };
  const { error } = id ? await supabase.from("taxes").update(values).eq("id", id).select("id").single() : await supabase.from("taxes").insert(values);
  if (error) flash("/taxes", "err", error.message);
  revalidatePath("/taxes");
  flash("/taxes", "ok", "Tax rule saved.");
}

export async function toggleTax(id: string, active: boolean) {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("taxes").update({ active }).eq("id", id).select("id").single();
  if (error) flash("/taxes", "err", error.message);
  revalidatePath("/taxes");
  flash("/taxes", "ok", "Tax status updated.");
}

// ───────── discounts (admin only) ─────────
export async function saveDiscount(id: string | null, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const back = id ? `/discounts/${id}` : "/discounts";
  const scope = str(form, "scope");
  const productIds = [...new Set(form.getAll("product_ids").map(String).filter(Boolean))];
  const value = Number(str(form, "value"));
  if (!str(form, "name") || !Number.isFinite(value) || value <= 0) flash(back, "err", "Enter a name and a value greater than zero.");
  if (!["percent", "fixed"].includes(str(form, "discount_type")) || !["product", "subscription"].includes(scope)) flash(back, "err", "Choose a valid discount type and scope.");
  if (str(form, "discount_type") === "percent" && value > 100) flash(back, "err", "A percentage can't exceed 100.");
  if (scope === "product" && !productIds.length) flash(back, "err", "Pick at least one product.");
  validateDates(form, back);
  validateNumbers(form, back, ["min_purchase", "min_quantity"]);
  const limit = optNum(form, "usage_limit");
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) flash(back, "err", "Usage limit must be a positive whole number.");
  const { error } = await supabase.rpc("save_catalog_discount", {
    p_id: id,
    p_values: {
      name: str(form, "name"), code: optStr(form, "code")?.toUpperCase() ?? null,
      discount_type: str(form, "discount_type"), value, scope,
      min_purchase: num(form, "min_purchase"), min_quantity: num(form, "min_quantity"),
      start_date: optStr(form, "start_date"), end_date: optStr(form, "end_date"),
      usage_limit: limit, active: id ? bool(form, "active") : true,
    },
    p_product_ids: scope === "product" ? productIds : [],
  });
  if (error) flash(back, "err", error.code === "23505" ? "That discount code is already used." : error.message);
  revalidatePath("/discounts", "layout");
  flash("/discounts", "ok", "Discount saved.");
}

export async function toggleDiscount(id: string, active: boolean) {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("discounts").update({ active }).eq("id", id).select("id").single();
  if (error) flash("/discounts", "err", error.message);
  revalidatePath("/discounts");
  flash("/discounts", "ok", "Discount status updated.");
}

// ───────── quotation templates (staff) ─────────
export async function saveTemplate(id: string | null, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = id ? `/templates/${id}` : "/templates";
  if (!str(form, "name")) flash(back, "err", "Template name is required.");
  const validity = Number(str(form, "validity_days"));
  const terms = Number(str(form, "payment_terms_days"));
  if (!str(form, "validity_days") || !Number.isSafeInteger(validity) || validity < 1) flash(back, "err", "Validity must be a positive whole number of days.");
  if (!str(form, "payment_terms_days") || !Number.isSafeInteger(terms) || terms < 0) flash(back, "err", "Payment terms must be a non-negative whole number of days.");
  const values = {
    name: str(form, "name"), plan_id: optStr(form, "plan_id"),
    validity_days: validity, payment_terms_days: terms, notes: optStr(form, "notes"),
  };
  const { data, error } = id
    ? await supabase.from("quotation_templates").update(values).eq("id", id).select("id").single()
    : await supabase.from("quotation_templates").insert(values).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/templates", "layout");
  flash(`/templates/${data.id}`, "ok", "Template saved.");
}

export async function saveTemplateLine(templateId: string, lineId: string | null, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/templates/${templateId}`;
  const [productId, variantId] = str(form, "product").split("|");
  const quantity = Number(str(form, "quantity"));
  const price = optNum(form, "unit_price");
  if (!productId) flash(back, "err", "Choose a product.");
  if (!Number.isFinite(quantity) || quantity <= 0) flash(back, "err", "Quantity must be greater than zero.");
  if (price !== null && (!Number.isFinite(price) || price < 0)) flash(back, "err", "Price must be a valid non-negative number, or empty for list price.");
  let current: { product_id: string; tax_id: string | null } | null = null;
  if (lineId) {
    const { data, error } = await supabase.from("quotation_template_lines").select("product_id, tax_id").eq("id", lineId).eq("template_id", templateId).single();
    if (error) flash(back, "err", "Template line not found.");
    current = data;
  }
  const { data: product, error: productError } = await supabase.from("products").select("active").eq("id", productId).single();
  if (productError || !product) flash(back, "err", "Product not found.");
  if (!product.active && productId !== current?.product_id) flash(back, "err", "Choose an active product.");
  if (variantId) {
    const { data, error } = await supabase.from("product_variants").select("id").eq("id", variantId).eq("product_id", productId).single();
    if (error || !data) flash(back, "err", "The selected variant does not belong to this product.");
  }
  const taxId = optStr(form, "tax_id");
  if (taxId) {
    const { data, error } = await supabase.from("taxes").select("active").eq("id", taxId).single();
    if (error || !data || (!data.active && taxId !== current?.tax_id)) flash(back, "err", "Choose an active tax rule, or keep the existing tax.");
  }
  const values = { product_id: productId, variant_id: variantId || null, quantity, unit_price: price, tax_id: taxId };
  const { error } = lineId
    ? await supabase.from("quotation_template_lines").update(values).eq("id", lineId).eq("template_id", templateId).select("id").single()
    : await supabase.from("quotation_template_lines").insert({ ...values, template_id: templateId });
  if (error) flash(back, "err", error.message);
  revalidatePath("/templates", "layout");
  flash(back, "ok", lineId ? "Template line saved." : "Template line added.");
}

export async function removeTemplateLine(templateId: string, lineId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/templates/${templateId}`;
  const { error } = await supabase.from("quotation_template_lines").delete().eq("id", lineId).eq("template_id", templateId).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/templates", "layout");
  flash(back, "ok", "Template line removed.");
}

export async function updateVariant(productId: string, variantId: string, form: FormData) {
  await requireRole("admin");
  const back = `/products/${productId}`;
  const extra = Number(str(form, "extra_price"));
  if (!str(form, "attribute") || !str(form, "value") || !Number.isFinite(extra)) flash(back, "err", "Enter an attribute, value and valid extra price.");
  const supabase = await createClient();
  const { error } = await supabase.from("product_variants").update({ attribute: str(form, "attribute"), value: str(form, "value"), extra_price: extra }).eq("id", variantId).eq("product_id", productId).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  flash(back, "ok", "Variant saved.");
}
