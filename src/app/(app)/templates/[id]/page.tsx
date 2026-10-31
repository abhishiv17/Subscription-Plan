import { notFound } from "next/navigation";
import { addTemplateLine, removeTemplateLine, saveTemplate } from "../../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, LinkButton, PageHeader, Select, Table, Textarea, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: t }, { data: plans }, { data: products }, { data: taxes }] = await Promise.all([
    supabase
      .from("quotation_templates")
      .select("*, quotation_template_lines(id, quantity, unit_price, products(name, sales_price), product_variants(attribute, value, extra_price), taxes(name))")
      .eq("id", id)
      .single(),
    supabase.from("plans").select("id, name").order("name"),
    supabase.from("products").select("id, name, sales_price, product_variants(id, attribute, value, extra_price)").eq("active", true).order("name"),
    supabase.from("taxes").select("id, name").eq("active", true),
  ]);
  if (!t) notFound();

  return (
    <>
      <PageHeader title={t.name} actions={<LinkButton href="/subscriptions/new">Use for a new subscription</LinkButton>} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Template">
          <form action={saveTemplate.bind(null, t.id)} className="space-y-3">
            <Field label="Name"><Input name="name" required defaultValue={t.name} /></Field>
            <Field label="Plan">
              <Select name="plan_id" defaultValue={t.plan_id ?? ""}>
                <option value="">None</option>
                {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valid for (days)"><Input name="validity_days" type="number" min="1" defaultValue={t.validity_days} /></Field>
              <Field label="Payment terms (days)"><Input name="payment_terms_days" type="number" min="0" defaultValue={t.payment_terms_days} /></Field>
            </div>
            <Field label="Notes"><Textarea name="notes" defaultValue={t.notes ?? ""} /></Field>
            <Button type="submit">Save</Button>
          </form>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Table head={["Product", "Qty", "Unit price", "Tax", ""]} empty={!t.quotation_template_lines.length}>
            {t.quotation_template_lines.map((l: any) => (
              <tr key={l.id}>
                <td className={tdCls}>
                  {l.products.name}
                  {l.product_variants && <span className="text-xs text-slate-500"> · {l.product_variants.attribute}: {l.product_variants.value}</span>}
                </td>
                <td className={tdCls}>{Number(l.quantity)}</td>
                <td className={tdCls}>
                  {fmtMoney(l.unit_price ?? Number(l.products.sales_price) + Number(l.product_variants?.extra_price ?? 0))}
                  {l.unit_price == null && <span className="text-xs text-slate-400"> (list)</span>}
                </td>
                <td className={tdCls}>{l.taxes?.name ?? "Product's tax"}</td>
                <td className={`${tdCls} text-right`}>
                  <form action={removeTemplateLine.bind(null, t.id, l.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>
                </td>
              </tr>
            ))}
          </Table>
          <Card title="Add line">
            <form action={addTemplateLine.bind(null, t.id)} className="grid gap-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Select name="product" required defaultValue="">
                  <option value="">Product…</option>
                  {products?.map((p) =>
                    p.product_variants.length ? (
                      p.product_variants.map((v: any) => (
                        <option key={v.id} value={`${p.id}|${v.id}`}>{p.name} · {v.attribute}: {v.value}</option>
                      ))
                    ) : (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ),
                  )}
                </Select>
              </div>
              <Input name="quantity" type="number" min="0.01" step="0.01" defaultValue={1} />
              <Input name="unit_price" type="number" min="0" step="0.01" placeholder="Price (list)" />
              <Select name="tax_id" defaultValue="">
                <option value="">Product&apos;s tax</option>
                {taxes?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
              <div className="sm:col-span-5"><Button type="submit">Add line</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
