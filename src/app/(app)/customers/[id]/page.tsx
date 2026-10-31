import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { Flash, type SearchParams } from "@/components/flash";
import { Card, LinkButton, PageHeader, Pagination, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const pageNumber = (v: string | string[] | undefined) => Math.max(1, Math.min(100000, Math.floor(Number(v) || 1)));
  const invoicesPage = pageNumber(sp.invoicesPage);
  const subscriptionsPage = pageNumber(sp.subscriptionsPage);
  const pageSize = 20;
  const href = (inv: number, sub: number) => `/customers/${id}?${new URLSearchParams({ invoicesPage: String(inv), subscriptionsPage: String(sub) })}`;
  const supabase = await createClient();
  const [{ data: customer, error: customerError }, { data: subs, error: subsError, count: subsCount }, { data: invoices, error: invoicesError, count: invoicesCount }, { data: balance, error: balanceError }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase.from("subscription_overview").select("id, number, plan_name, status, recurring_amount, next_invoice_date", { count: "exact" }).eq("customer_id", id).order("created_at", { ascending: false }).order("id").range((subscriptionsPage-1)*pageSize, subscriptionsPage*pageSize-1),
    supabase.from("invoice_overview").select("id, number, status, invoice_date, total, amount_due, is_overdue", { count: "exact" }).eq("customer_id", id).order("invoice_date", { ascending: false }).order("id").range((invoicesPage-1)*pageSize, invoicesPage*pageSize-1),
    supabase.rpc("customer_balance", { p_customer_id: id }),
  ]);
  if (customerError && customerError.code !== "PGRST116") throw new Error(customerError.message);
  if (!customer) notFound();
  for (const error of [subsError, invoicesError, balanceError]) if (error) throw new Error(error.message);
  const outstanding = Number(balance ?? 0);

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
            <Pagination page={subscriptionsPage} pageSize={pageSize} total={subsCount ?? 0} href={p => href(invoicesPage, p)} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Invoice history</h2>
            <p className="mb-3 text-xs text-slate-500">Outstanding balance includes all confirmed unpaid invoices, across every page.</p>
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
            <Pagination page={invoicesPage} pageSize={pageSize} total={invoicesCount ?? 0} href={p => href(p, subscriptionsPage)} />
          </div>
        </div>
        <Card title="Customer details"><CustomerForm customer={customer} /></Card>
      </div>
    </>
  );
}
