import Link from "next/link";
import { runBilling } from "./actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Input, LinkButton, Stat, Table, statusDot, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";

type Summary = {
  from: string;
  to: string;
  active_subscriptions: number;
  subscriptions_by_status: Record<string, number>;
  mrr: number;
  revenue: number;
  invoiced: number;
  outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  revenue_by_month: { month: string; amount: number }[];
};

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" && sp.from ? sp.from : undefined;
  const to = typeof sp.to === "string" && sp.to ? sp.to : undefined;

  const supabase = await createClient();
  const [{ data, error }, { data: overdue }] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_from: from ?? null, p_to: to ?? null }),
    supabase
      .from("invoice_overview")
      .select("id, number, customer_name, due_date, amount_due")
      .eq("is_overdue", true)
      .order("due_date")
      .limit(8),
  ]);
  if (error) throw error;
  const s = data as Summary;
  const maxMonth = Math.max(1, ...s.revenue_by_month.map((m) => Number(m.amount)));
  const thisMonth = new Date().toISOString().slice(0, 7);

  const outstanding = Number(s.outstanding);
  const overdueAmt = Number(s.overdue_amount);
  const overduePct = outstanding > 0 ? Math.min(100, (overdueAmt / outstanding) * 100) : 0;

  const statuses = ["draft", "quotation", "confirmed", "active", "paused", "closed"];
  const statusTotal = statuses.reduce((n, st) => n + (s.subscriptions_by_status[st] ?? 0), 0);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {fmtDate(s.from)} to {fmtDate(s.to)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex items-end gap-2">
            <label className="space-y-1 text-xs font-medium text-slate-500">
              <span>From</span>
              <Input type="date" name="from" defaultValue={s.from} />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-500">
              <span>To</span>
              <Input type="date" name="to" defaultValue={s.to} />
            </label>
            <Button variant="secondary" type="submit" className="!h-[38px]">Apply</Button>
          </form>
          <form action={runBilling}>
            <Button type="submit" className="!h-[38px]">Run billing</Button>
          </form>
        </div>
      </div>

      <Flash searchParams={searchParams} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly recurring revenue" value={fmtMoney(s.mrr)} hint="From active subscriptions" />
        <Stat label="Active subscriptions" value={s.active_subscriptions.toLocaleString("en-IN")} />
        <Stat label="Collected" value={fmtMoney(s.revenue)} hint="Payments in this period" />
        <Stat label="Invoiced" value={fmtMoney(s.invoiced)} hint="Confirmed and paid, this period" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Collected each month" className="lg:col-span-2">
          {s.revenue_by_month.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">Payments will show here once customers start paying.</p>
          ) : (
            <div className="flex h-56 items-end gap-1.5 border-b border-slate-200 sm:gap-3">
              {s.revenue_by_month.map((m) => {
                const current = m.month === thisMonth;
                return (
                  <div key={m.month} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <span className="tabular pointer-events-none absolute -top-1 hidden -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white group-hover:block">
                      {fmtMoney(m.amount)}
                    </span>
                    <div
                      className={`w-full max-w-10 rounded-t-md transition-colors ${current ? "bg-brand" : "bg-brand/25 group-hover:bg-brand/45"}`}
                      style={{ height: `${Math.max(2, (Number(m.amount) / maxMonth) * 100)}%` }}
                      title={`${m.month}: ${fmtMoney(m.amount)}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {s.revenue_by_month.length > 0 && (
            <div className="mt-2 flex gap-1.5 sm:gap-3">
              {s.revenue_by_month.map((m) => (
                <span key={m.month} className={`flex-1 text-center text-[11px] ${m.month === thisMonth ? "font-semibold text-brand" : "text-slate-500"}`}>
                  {new Date(`${m.month}-01`).toLocaleDateString("en-IN", { month: "short" })}
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-4">
          <Card title="Waiting to be paid">
            <div className="tabular text-[26px] font-semibold leading-none tracking-tight">{fmtMoney(outstanding)}</div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="bg-loop" style={{ width: `${100 - overduePct}%` }} />
              <div className="bg-red-500" style={{ width: `${overduePct}%` }} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-loop" />Not due yet</dt>
                <dd className="tabular font-medium">{fmtMoney(outstanding - overdueAmt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-red-500" />Overdue ({s.overdue_count})</dt>
                <dd className="tabular font-medium text-red-700">{fmtMoney(overdueAmt)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Subscriptions" actions={<span className="tabular text-sm text-slate-500">{statusTotal.toLocaleString("en-IN")}</span>}>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              {statuses.map((st) => {
                const n = s.subscriptions_by_status[st] ?? 0;
                return n ? <div key={st} className={statusDot(st)} style={{ width: `${(n / statusTotal) * 100}%` }} /> : null;
              })}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
              {statuses.map((st) => (
                <li key={st}>
                  <Link href={`/subscriptions?status=${st}`} className="-mx-1.5 flex items-center justify-between rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${statusDot(st)}`} />
                      {titleCase(st)}
                    </span>
                    <span className="tabular font-medium">{(s.subscriptions_by_status[st] ?? 0).toLocaleString("en-IN")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">Overdue invoices to chase</h2>
          <LinkButton variant="ghost" href="/invoices?filter=overdue">See all overdue</LinkButton>
        </div>
        <Table head={["Invoice", "Customer", "Due date", "Amount due"]} empty={!overdue?.length}>
          {overdue?.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <td className={tdCls}><Link className="font-semibold text-brand hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
              <td className={tdCls}>{i.customer_name}</td>
              <td className={`${tdCls} text-red-700`}>{fmtDate(i.due_date)}</td>
              <td className={`${tdCls} font-medium text-slate-900`}>{fmtMoney(i.amount_due)}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
