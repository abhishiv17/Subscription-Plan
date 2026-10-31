import Link from "next/link";
import { saveProduct } from "../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, Select, StatusBadge, Table, Textarea, tdCls } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_TYPES } from "@/lib/constants";
import { fmtMoney, titleCase } from "@/lib/format";

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  const supabase = await createClient();
  const sp = await searchParams;
  const type = typeof sp.type === "string" && PRODUCT_TYPES.includes(sp.type as typeof PRODUCT_TYPES[number]) ? sp.type : "";
  const active = sp.active === "true" || sp.active === "false" ? sp.active : "";
  let query = supabase.from("products").select("id, name, product_type, sales_price, cost_price, active, taxes(name), product_variants(id)").order("name");
  if (type) query = query.eq("product_type", type);
  if (active) query = query.eq("active", active === "true");
  const [{ data: products, error }, { data: taxes }] = await Promise.all([
    query,
    supabase.from("taxes").select("id, name").eq("active", true),
  ]);
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Products" subtitle="What Brightloop sells, with variants such as brand" />
      <Flash searchParams={searchParams} />
      <form className="mb-4 flex items-end gap-3" action="/products">
        <Field label="Type"><Select name="type" defaultValue={type}><option value="">All types</option>{PRODUCT_TYPES.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
        <Field label="Status"><Select name="active" defaultValue={active}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></Select></Field>
        <Button>Filter</Button><Link href="/products" className="text-sm text-brand">Reset</Link>
      </form>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={profile?.role === "admin" ? "lg:col-span-2" : "lg:col-span-3"}>
          <Table head={["Name", "Type", "Sales price", "Cost price", "Tax", "Variants", "Status"]} empty={!products?.length}>
            {products?.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/products/${p.id}`}>{p.name}</Link></td>
                <td className={tdCls}>{titleCase(p.product_type)}</td>
                <td className={tdCls}>{fmtMoney(p.sales_price)}</td>
                <td className={tdCls}>{fmtMoney(p.cost_price)}</td>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <td className={tdCls}>{(p.taxes as any)?.name ?? "—"}</td>
                <td className={tdCls}>{p.product_variants.length || "—"}</td>
                <td className={tdCls}><StatusBadge status={p.active ? "active" : "closed"} /></td>
              </tr>
            ))}
          </Table>
        </div>
        {profile?.role === "admin" && (
          <Card title="New product">
            <form action={saveProduct.bind(null, null)} className="space-y-3">
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Type">
                <Select name="product_type" defaultValue="software">
                  {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sales price"><Input name="sales_price" type="number" step="0.01" min="0" required /></Field>
                <Field label="Cost price"><Input name="cost_price" type="number" step="0.01" min="0" defaultValue={0} /></Field>
              </div>
              <Field label="Tax">
                <Select name="tax_id" defaultValue="">
                  <option value="">No tax</option>
                  {taxes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Notes"><Textarea name="notes" /></Field>
              <Button type="submit" className="w-full">Create product</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
