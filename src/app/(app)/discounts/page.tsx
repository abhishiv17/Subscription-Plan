import { saveDiscount, toggleDiscount } from "../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, Select, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function DiscountsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: discounts }, { data: products }] = await Promise.all([
    supabase.from("discounts").select("*, discount_products(products(name))").order("created_at", { ascending: false }),
    supabase.from("products").select("id, name").eq("active", true).order("name"),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Discounts" subtitle="Applied automatically on the next eligible invoice; stop when they expire or run out" />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Discount", "Value", "Applies to", "Conditions", "Valid", "Used", "Status", ""]} empty={!discounts?.length}>
            {discounts?.map((d) => {
              const expired = (d.end_date && d.end_date < today) || (d.usage_limit && d.used_count >= d.usage_limit);
              return (
                <tr key={d.id}>
                  <td className={tdCls}>
                    <div className="font-medium">{d.name}</div>
                    {d.code && <div className="font-mono text-xs text-slate-500">{d.code}</div>}
                  </td>
                  <td className={tdCls}>{d.discount_type === "percent" ? `${Number(d.value)}%` : fmtMoney(d.value)}</td>
                  <td className={`${tdCls} text-xs`}>
                    {d.scope === "subscription"
                      ? "Whole subscription"
                      : d.discount_products.map((dp: { products: { name: string } }) => dp.products.name).join(", ")}
                  </td>
                  <td className={`${tdCls} text-xs`}>
                    {Number(d.min_purchase) > 0 && <div>Min {fmtMoney(d.min_purchase)}</div>}
                    {Number(d.min_quantity) > 0 && <div>Min qty {Number(d.min_quantity)}</div>}
                    {!Number(d.min_purchase) && !Number(d.min_quantity) && "—"}
                  </td>
                  <td className={`${tdCls} text-xs`}>{fmtDate(d.start_date)} – {fmtDate(d.end_date)}</td>
                  <td className={tdCls}>{d.used_count}{d.usage_limit ? ` / ${d.usage_limit}` : ""}</td>
                  <td className={tdCls}><StatusBadge status={!d.active ? "closed" : expired ? "overdue" : "active"} /></td>
                  <td className={`${tdCls} text-right`}>
                    <form action={toggleDiscount.bind(null, d.id, !d.active)}><Button variant="ghost">{d.active ? "Disable" : "Enable"}</Button></form>
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
        <Card title="New discount rule">
          <form action={saveDiscount} className="space-y-3">
            <Field label="Name"><Input name="name" placeholder="Volume 10%" required /></Field>
            <Field label="Code (optional)"><Input name="code" placeholder="VOLUME10" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select name="discount_type" defaultValue="percent">
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </Select>
              </Field>
              <Field label="Value"><Input name="value" type="number" step="0.01" min="0.01" required /></Field>
            </div>
            <Field label="Applies to">
              <Select name="scope" defaultValue="subscription">
                <option value="subscription">Whole subscriptions (attach to a subscription)</option>
                <option value="product">Specific products (applies automatically)</option>
              </Select>
            </Field>
            <Field label="Products" hint="For product discounts; hold Ctrl to pick several">
              <select name="product_ids" multiple className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" size={4}>
                {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min purchase"><Input name="min_purchase" type="number" step="0.01" min="0" defaultValue={0} /></Field>
              <Field label="Min quantity"><Input name="min_quantity" type="number" step="1" min="0" defaultValue={0} /></Field>
              <Field label="Starts"><Input name="start_date" type="date" /></Field>
              <Field label="Ends"><Input name="end_date" type="date" /></Field>
            </div>
            <Field label="Usage limit" hint="Leave empty for unlimited"><Input name="usage_limit" type="number" min="1" /></Field>
            <Button type="submit" className="w-full">Create discount</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
