import { notFound } from "next/navigation";
import { addVariant, removeVariant, saveProduct, updateVariant } from "../../catalog-actions";
import { PRODUCT_TYPES } from "@/lib/constants";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, Select, Table, Textarea, tdCls } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, titleCase } from "@/lib/format";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const supabase = await createClient();
  const [{ data: p }, { data: taxes }] = await Promise.all([
    supabase.from("products").select("*, product_variants(*)").eq("id", id).single(),
    supabase.from("taxes").select("id, name, active"),
  ]);
  if (!p) notFound();

  return (
    <>
      <PageHeader title={p.name} subtitle={`${titleCase(p.product_type)} · ${fmtMoney(p.sales_price)}`} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Product">
          <form action={saveProduct.bind(null, p.id)} className="space-y-3">
            <fieldset disabled={!isAdmin} className="space-y-3">
              <Field label="Name"><Input name="name" required defaultValue={p.name} /></Field>
              <Field label="Type">
                <Select name="product_type" defaultValue={p.product_type}>
                  {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sales price"><Input name="sales_price" type="number" step="0.01" min="0" defaultValue={p.sales_price} /></Field>
                <Field label="Cost price"><Input name="cost_price" type="number" step="0.01" min="0" defaultValue={p.cost_price} /></Field>
              </div>
              <Field label="Tax">
                <Select name="tax_id" defaultValue={p.tax_id ?? ""}>
                  <option value="">No tax</option>
                  {taxes?.map((t) => <option key={t.id} value={t.id}>{t.name}{!t.active ? " (inactive)" : ""}</option>)}
                </Select>
              </Field>
              <Field label="Notes"><Textarea name="notes" defaultValue={p.notes ?? ""} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} /> Active</label>
            </fieldset>
            {isAdmin && <Button type="submit">Save product</Button>}
          </form>
        </Card>

        <div className="space-y-4">
          <Table head={["Attribute", "Value", "Extra price", "Final price", ""]} empty={!p.product_variants.length}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {p.product_variants.map((v: any) => (
              <tr key={v.id}>
                <td className={tdCls}>{v.attribute}</td>
                <td className={tdCls}>{v.value}</td>
                <td className={tdCls}>+{fmtMoney(v.extra_price)}</td>
                <td className={tdCls}>{fmtMoney(Number(p.sales_price) + Number(v.extra_price))}</td>
                <td className={`${tdCls} text-right`}>
                  {isAdmin && <details className="mb-2"><summary className="cursor-pointer text-brand">Edit</summary><form action={updateVariant.bind(null, p.id, v.id)} className="mt-2 space-y-2">
                    <Input aria-label="Attribute" name="attribute" defaultValue={v.attribute} required />
                    <Input aria-label="Value" name="value" defaultValue={v.value} required />
                    <Input aria-label="Extra price" name="extra_price" type="number" step="0.01" defaultValue={v.extra_price} required />
                    <Button>Save variant</Button>
                  </form></details>}
                  {isAdmin && <form action={removeVariant.bind(null, p.id, v.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>}
                </td>
              </tr>
            ))}
          </Table>
          {isAdmin && (
            <Card title="Add variant">
              <form action={addVariant.bind(null, p.id)} className="grid gap-3 sm:grid-cols-4">
                <Input name="attribute" placeholder="Attribute, e.g. Brand" required />
                <Input name="value" placeholder="Value, e.g. Odoo" required />
                <Input name="extra_price" type="number" step="0.01" placeholder="Extra, e.g. 560" />
                <Button type="submit">Add</Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
