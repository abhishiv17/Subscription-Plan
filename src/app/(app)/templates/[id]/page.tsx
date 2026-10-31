import { Fragment } from "react";
import { notFound } from "next/navigation";
import { removeTemplateLine, saveTemplate } from "../../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, LinkButton, PageHeader, Select, Table, Textarea, tdCls } from "@/components/ui";
import { TemplateLineForm } from "@/components/template-line-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireRole("admin", "staff");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: t, error }, { data: plans, error: planError }, { data: products, error: productError }, { data: taxes, error: taxError }] = await Promise.all([
    supabase.from("quotation_templates").select("*").eq("id", id).single(),
    supabase.from("plans").select("id, name, active").order("name"),
    supabase.from("products").select("id, name, active, sales_price, product_variants(id, attribute, value, extra_price)").order("name"),
    supabase.from("taxes").select("id, name, active").order("rate"),
  ]);
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (!t) notFound();
  for (const e of [planError, productError, taxError]) if (e) throw new Error(e.message);
  const { data: lines, error: lineError } = await supabase.from("quotation_template_lines").select("*").eq("template_id", id).order("id");
  if (lineError) throw new Error(lineError.message);
  return <>
    <PageHeader title={t.name} subtitle="Set the offer, edit its lines, then copy it into a new draft. Existing subscriptions keep their copied prices." actions={<LinkButton href={`/subscriptions/new?template=${t.id}`}>Use for a new subscription</LinkButton>} />
    <Flash searchParams={searchParams} />
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Template"><form action={saveTemplate.bind(null, t.id)} className="space-y-3">
        <Field label="Name"><Input name="name" required defaultValue={t.name} /></Field>
        <Field label="Plan"><Select name="plan_id" defaultValue={t.plan_id ?? ""}><option value="">Choose when creating a subscription</option>{plans?.map(p => <option key={p.id} value={p.id}>{p.name}{!p.active ? " (inactive)" : ""}</option>)}</Select></Field>
        <Field label="Valid for (days)"><Input name="validity_days" type="number" min="1" step="1" required defaultValue={t.validity_days} /></Field>
        <Field label="Payment terms (days)"><Input name="payment_terms_days" type="number" min="0" step="1" required defaultValue={t.payment_terms_days} /></Field>
        <Field label="Notes"><Textarea name="notes" defaultValue={t.notes ?? ""} /></Field>
        <Button>Save template</Button>
      </form></Card>
      <div className="space-y-4 lg:col-span-2">
        <Table head={["Product", "Qty", "Unit price", "Tax", ""]} empty={!lines?.length}>
          {lines?.map(line => {
            const product = products?.find(p => p.id === line.product_id);
            const variant = product?.product_variants.find(v => v.id === line.variant_id);
            const price = line.unit_price ?? Number(product?.sales_price ?? 0) + Number(variant?.extra_price ?? 0);
            return <Fragment key={line.id}><tr>
              <td className={tdCls}>{product?.name ?? "Unavailable product"}{variant && <span className="block text-xs text-slate-500">{variant.attribute}: {variant.value}</span>}</td>
              <td className={tdCls}>{Number(line.quantity)}</td>
              <td className={tdCls}>{fmtMoney(price)}{line.unit_price == null && <span className="text-xs text-slate-400"> (list)</span>}</td>
              <td className={tdCls}>{taxes?.find(tax => tax.id === line.tax_id)?.name ?? "Product tax"}</td>
              <td className={tdCls}><form action={removeTemplateLine.bind(null, id, line.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form></td>
            </tr><tr><td colSpan={5} className="border-b border-slate-100 px-4 py-3"><details><summary className="cursor-pointer text-sm font-medium text-brand">Edit line</summary><div className="mt-4"><TemplateLineForm templateId={id} line={line} products={products ?? []} taxes={taxes ?? []} /></div></details></td></tr></Fragment>;
          })}
        </Table>
        <Card title="Add line"><TemplateLineForm templateId={id} products={products ?? []} taxes={taxes ?? []} /></Card>
      </div>
    </div>
  </>;
}
