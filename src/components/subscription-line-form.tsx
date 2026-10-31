"use client";

import { useState } from "react";
import { saveLine } from "@/app/(app)/subscriptions/actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { hasTwoDecimals, lineAmounts } from "@/lib/subscriptions";

export type LineProduct = { id: string; name: string; active: boolean; sales_price: number; tax_id: string | null;
  product_variants: { id: string; attribute: string; value: string; extra_price: number }[] };
export type LineTax = { id: string; name: string; active: boolean; rate: number };
type Line = { id: string; product_id: string; variant_id: string | null; quantity: number; unit_price: number; tax_id: string | null; description: string | null };
export function SubscriptionLineForm({ subscriptionId, line, products, taxes }: { subscriptionId: string; line?: Line; products: LineProduct[]; taxes: LineTax[] }) {
  const [productId, setProductId] = useState(line?.product_id ?? "");
  const [variantId, setVariantId] = useState(line?.variant_id ?? "");
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1));
  const [override, setOverride] = useState(line ? String(line.unit_price) : "");
  const [taxId, setTaxId] = useState(line?.tax_id ?? "");
  const product = products.find(p => p.id === productId);
  const variant = product?.product_variants.find(v => v.id === variantId);
  const listPrice = Number(product?.sales_price ?? 0) + Number(variant?.extra_price ?? 0);
  const unitPrice = override === "" ? listPrice : Number(override);
  const tax = taxes.find(t => t.id === (taxId || product?.tax_id));
  const valid = Number.isFinite(unitPrice) && unitPrice >= 0 && Number.isFinite(Number(quantity)) && Number(quantity) > 0 && hasTwoDecimals(unitPrice) && hasTwoDecimals(Number(quantity));
  const amounts = lineAmounts(valid ? Number(quantity) : 0, valid ? unitPrice : 0, Number(tax?.rate ?? 0));
  return <form action={saveLine.bind(null, subscriptionId, line?.id ?? null)} className="grid gap-4 sm:grid-cols-2">
    <Field label="Product"><Select name="product_id" required value={productId} onChange={e => { setProductId(e.target.value); setVariantId(""); setOverride(""); setTaxId(""); }}><option value="">Choose a product...</option>{products.filter(p => p.active || p.id === line?.product_id).map(p => <option key={p.id} value={p.id}>{p.name}{!p.active ? " (inactive)" : ""}</option>)}</Select></Field>
    <Field label="Variant"><Select name="variant_id" value={variantId} onChange={e => { setVariantId(e.target.value); setOverride(""); }}><option value="">Base product</option>{product?.product_variants.map(v => <option key={v.id} value={v.id}>{v.attribute}: {v.value} ({fmtMoney(Number(product.sales_price) + Number(v.extra_price))})</option>)}</Select></Field>
    <Field label="Quantity"><Input name="quantity" type="number" min="0.01" step="0.01" required value={quantity} onChange={e => setQuantity(e.target.value)} /></Field>
    <Field label="Unit price" hint={`Leave empty for product price: ${fmtMoney(listPrice)}`}><Input name="unit_price" type="number" min="0" step="0.01" value={override} onChange={e => setOverride(e.target.value)} placeholder={fmtMoney(listPrice)} /></Field>
    <Field label="Tax"><Select name="tax_id" value={taxId} onChange={e => setTaxId(e.target.value)}><option value="">Use product tax</option>{taxes.filter(t => t.active || t.id === line?.tax_id).map(t => <option key={t.id} value={t.id}>{t.name}{!t.active ? " (inactive)" : ""}</option>)}</Select></Field>
    <Field label="Description (optional)"><Input name="description" defaultValue={line?.description ?? ""} /></Field>
    <p className="rounded-lg bg-brand-light p-3 text-sm sm:col-span-2" aria-live="polite">Line preview: {fmtMoney(amounts.subtotal)} + {fmtMoney(amounts.tax)} tax = <strong>{fmtMoney(amounts.total)}</strong><span className="mt-1 block text-xs text-slate-600">Before eligible discounts, which are calculated when invoiced.</span></p>
    <div className="sm:col-span-2"><Button>{line ? "Save line" : "Add line"}</Button></div>
  </form>;
}
