"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { bool, flash, num, optNum, optStr, str } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

// ───────── products & variants (admin) ─────────
export async function saveProduct(id: string | null, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const back = id ? `/products/${id}` : "/products";
  if (!str(form, "name")) flash(back, "err", "Product name is required.");
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
  revalidatePath("/products");
  redirect(`/products/${data.id}?ok=${encodeURIComponent("Product saved.")}`);
}

export async function addVariant(productId: string, form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const back = `/products/${productId}`;
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
  const { error } = await supabase.from("product_variants").delete().eq("id", variantId);
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
    ? await supabase.from("plans").update(values).eq("id", id)
    : await supabase.from("plans").insert(values);
  if (error) flash(back, "err", error.message);
  revalidatePath("/plans");
  flash("/plans", "ok", `Plan "${values.name}" saved.`);
}

// ───────── taxes (admin) ─────────
export async function saveTax(form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const rate = num(form, "rate", -1);
  if (!str(form, "name") || rate < 0 || rate > 100) flash("/taxes", "err", "Enter a name and a rate between 0 and 100.");
  const { error } = await supabase.from("taxes").insert({ name: str(form, "name"), rate });
  if (error) flash("/taxes", "err", error.message);
  revalidatePath("/taxes");
  flash("/taxes", "ok", "Tax rule added.");
}

export async function toggleTax(id: string, active: boolean) {
  await requireRole("admin");
  const supabase = await createClient();
  await supabase.from("taxes").update({ active }).eq("id", id);
  revalidatePath("/taxes");
}

// ───────── discounts (admin only) ─────────
export async function saveDiscount(form: FormData) {
  await requireRole("admin");
  const supabase = await createClient();
  const scope = str(form, "scope");
  const productIds = form.getAll("product_ids").map(String).filter(Boolean);
  const value = num(form, "value");
  if (!str(form, "name") || value <= 0) flash("/discounts", "err", "Enter a name and a value greater than zero.");
  if (str(form, "discount_type") === "percent" && value > 100) flash("/discounts", "err", "A percentage can't exceed 100.");
  if (scope === "product" && productIds.length === 0) flash("/discounts", "err", "Pick at least one product for a product discount.");

  const { data, error } = await supabase
    .from("discounts")
    .insert({
      name: str(form, "name"),
      code: optStr(form, "code")?.toUpperCase() ?? null,
      discount_type: str(form, "discount_type"),
      value,
      scope,
      min_purchase: num(form, "min_purchase"),
      min_quantity: num(form, "min_quantity"),
      start_date: optStr(form, "start_date"),
      end_date: optStr(form, "end_date"),
      usage_limit: optNum(form, "usage_limit"),
    })
    .select("id")
    .single();
  if (error) flash("/discounts", "err", error.code === "23505" ? "That discount code is already used." : error.message);
  if (scope === "product") {
    const { error: linkErr } = await supabase
      .from("discount_products")
      .insert(productIds.map((product_id) => ({ discount_id: data.id, product_id })));
    if (linkErr) flash("/discounts", "err", linkErr.message);
  }
  revalidatePath("/discounts");
  flash("/discounts", "ok", "Discount rule created. It will apply automatically on the next eligible invoice.");
}

export async function toggleDiscount(id: string, active: boolean) {
  await requireRole("admin");
  const supabase = await createClient();
  await supabase.from("discounts").update({ active }).eq("id", id);
  revalidatePath("/discounts");
}

// ───────── quotation templates (staff) ─────────
export async function saveTemplate(id: string | null, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = id ? `/templates/${id}` : "/templates";
  if (!str(form, "name")) flash(back, "err", "Template name is required.");
  const values = {
    name: str(form, "name"),
    plan_id: optStr(form, "plan_id"),
    validity_days: Math.max(1, num(form, "validity_days", 30)),
    payment_terms_days: Math.max(0, num(form, "payment_terms_days", 15)),
    notes: optStr(form, "notes"),
  };
  const { data, error } = id
    ? await supabase.from("quotation_templates").update(values).eq("id", id).select("id").single()
    : await supabase.from("quotation_templates").insert(values).select("id").single();
  if (error) flash(back, "err", error.message);
  revalidatePath("/templates");
  redirect(`/templates/${data.id}?ok=${encodeURIComponent("Template saved.")}`);
}

export async function addTemplateLine(templateId: string, form: FormData) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const back = `/templates/${templateId}`;
  const [productId, variantId] = str(form, "product").split("|");
  if (!productId) flash(back, "err", "Choose a product.");
  const { error } = await supabase.from("quotation_template_lines").insert({
    template_id: templateId,
    product_id: productId,
    variant_id: variantId || null,
    quantity: num(form, "quantity", 1),
    unit_price: optNum(form, "unit_price"),
    tax_id: optStr(form, "tax_id"),
  });
  if (error) flash(back, "err", error.message);
  revalidatePath(back);
  flash(back, "ok", "Line added.");
}

export async function removeTemplateLine(templateId: string, lineId: string) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  await supabase.from("quotation_template_lines").delete().eq("id", lineId);
  revalidatePath(`/templates/${templateId}`);
}
