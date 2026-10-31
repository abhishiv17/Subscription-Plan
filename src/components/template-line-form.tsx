import { saveTemplateLine } from "@/app/(app)/catalog-actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

export type TemplateProduct = {
  id: string; name: string; active: boolean; sales_price: number;
  product_variants: { id: string; attribute: string; value: string; extra_price: number }[];
};
export type TemplateTax = { id: string; name: string; active: boolean };
export type EditableTemplateLine = {
  id: string; product_id: string; variant_id: string | null;
  quantity: number; unit_price: number | null; tax_id: string | null;
};
export function TemplateLineForm({ templateId, line, products, taxes }: {
  templateId: string; line?: EditableTemplateLine; products: TemplateProduct[]; taxes: TemplateTax[];
}) {
  return <form action={saveTemplateLine.bind(null, templateId, line?.id ?? null)} className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><Field label="Product and variant"><Select name="product" required defaultValue={line ? `${line.product_id}${line.variant_id ? `|${line.variant_id}` : ""}` : ""}>
      <option value="">Choose a product...</option>
      {products.filter(p => p.active || p.id === line?.product_id).flatMap(p => [
        <option key={p.id} value={p.id}>{p.name} - base ({fmtMoney(p.sales_price)}){!p.active ? " (inactive)" : ""}</option>,
        ...p.product_variants.map(v => <option key={v.id} value={`${p.id}|${v.id}`}>{p.name} - {v.attribute}: {v.value} ({fmtMoney(Number(p.sales_price) + Number(v.extra_price))}){!p.active ? " (inactive)" : ""}</option>),
      ])}
    </Select></Field></div>
    <Field label="Quantity"><Input name="quantity" type="number" min="0.01" step="0.01" required defaultValue={line?.quantity ?? 1} /></Field>
    <Field label="Unit price override" hint="Leave empty to use the current list price when copied"><Input name="unit_price" type="number" min="0" step="0.01" defaultValue={line?.unit_price ?? ""} placeholder="Use list price" /></Field>
    <div className="sm:col-span-2"><Field label="Tax"><Select name="tax_id" defaultValue={line?.tax_id ?? ""}>
      <option value="">Use product tax</option>
      {taxes.filter(t => t.active || t.id === line?.tax_id).map(t => <option key={t.id} value={t.id}>{t.name}{!t.active ? " (inactive)" : ""}</option>)}
    </Select></Field></div>
    <div className="sm:col-span-2"><Button>{line ? "Save line" : "Add line"}</Button></div>
  </form>;
}
