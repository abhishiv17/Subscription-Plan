import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { Flash, type SearchParams } from "@/components/flash";
import { Card, LinkButton, PageHeader, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: customer }, { data: subs }, { data: invoices }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase.from("subscription_overview").select("id, number, plan_name, status, recurring_amount, next_invoice_date").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("invoice_overview").select("id, number, status, invoice_date, total, amount_due, is_overdue").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(20),
  ]);
  if (!customer) notFound();
  const outstanding = (invoices ?? []).filter((i) => i.status === "confirmed").reduce((s, i) => s + Number(i.amount_due), 0);

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.email}${customer.user_id ? " · has portal access" : ""} · outstanding ${fmtMoney(outstanding)}`}
        actions={<LinkButton href={`/subscriptions/new?customer=${customer.id}`}>New subscription</LinkButton>}
      />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Subscriptions</h2>
            <Table head={["Number", "Plan", "Status", "Recurring"]} empty={!subs?.length}>
              {subs?.map((s) => (
                <tr key={s.id}>
                  <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/subscriptions/${s.id}`}>{s.number}</Link></td>
                  <td className={tdCls}>{s.plan_name}</td>
                  <td className={tdCls}><StatusBadge status={s.status} /></td>
                  <td className={tdCls}>{fmtMoney(s.recurring_amount)}</td>
                </tr>
              ))}
            </Table>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Recent invoices</h2>
            <Table head={["Invoice", "Date", "Status", "Total", "Due"]} empty={!invoices?.length}>
              {invoices?.map((i) => (
                <tr key={i.id}>
                  <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
                  <td className={tdCls}>{fmtDate(i.invoice_date)}</td>
                  <td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td>
                  <td className={tdCls}>{fmtMoney(i.total)}</td>
                  <td className={tdCls}>{fmtMoney(i.amount_due)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
        <Card title="Customer details"><CustomerForm customer={customer} /></Card>
      </div>
    </>
  );
}
