import Link from "next/link";
import { DiscountForm } from "@/components/discount-form";
import { toggleDiscount } from "../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, PageHeader, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function DiscountsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireRole("admin", "staff");
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();
  const [{ data: discounts, error }, { data: products }] = await Promise.all([
    supabase.from("discounts").select("*, discount_products(products(name))").order("created_at", { ascending: false }),
    supabase.from("products").select("id, name").eq("active", true).order("name"),
  ]);
  if (error) throw new Error(error.message);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Discounts" subtitle="Applied automatically on the next eligible invoice; stop when they expire or run out" />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
          <Table head={["Discount", "Value", "Applies to", "Conditions", "Valid", "Used", "Status", ""]} empty={!discounts?.length}>
            {discounts?.map((d) => {
              const expired = (d.end_date && d.end_date < today) || (d.usage_limit && d.used_count >= d.usage_limit);
              return (
                <tr key={d.id}>
                  <td className={tdCls}>
                    <Link href={`/discounts/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link>
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
                    {isAdmin && <form action={toggleDiscount.bind(null, d.id, !d.active)}><Button variant="ghost">{d.active ? "Disable" : "Enable"}</Button></form>}
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
        {isAdmin && <Card title="New discount rule">
          <DiscountForm products={products ?? []} />
        </Card>}
      </div>
    </>
  );
}
