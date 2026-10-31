import Link from "next/link";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Input, LinkButton, PageHeader, Pagination, Select, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";

const PAGE_SIZE = 25;
const STATUSES = ["draft", "quotation", "confirmed", "active", "paused", "closed"];

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[,()%*]/g, "").trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("subscription_overview")
    .select("id, number, customer_name, plan_name, billing_period, status, start_date, expiry_date, next_invoice_date, recurring_amount", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`number.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) throw error;

  const href = (p: number) => `/subscriptions?${new URLSearchParams({ q, status, page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Every subscription and where it stands"
        actions={<LinkButton href="/subscriptions/new">New subscription</LinkButton>}
      />
      <Flash searchParams={searchParams} />
      <form className="mb-4 flex flex-wrap gap-2">
        <div className="w-64"><Input name="q" placeholder="Search number or customer" defaultValue={q} /></div>
        <div className="w-44">
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </div>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      <Table head={["Number", "Customer", "Plan", "Status", "Start", "Expiry", "Next invoice", "Recurring"]} empty={!data?.length}>
        {data?.map((s) => (
          <tr key={s.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/subscriptions/${s.id}`}>{s.number}</Link></td>
            <td className={tdCls}>{s.customer_name}</td>
            <td className={tdCls}>{s.plan_name} <span className="text-xs text-slate-400">· {s.billing_period}</span></td>
            <td className={tdCls}><StatusBadge status={s.status} /></td>
            <td className={tdCls}>{fmtDate(s.start_date)}</td>
            <td className={tdCls}>{fmtDate(s.expiry_date)}</td>
            <td className={tdCls}>{s.status === "active" ? fmtDate(s.next_invoice_date) : "—"}</td>
            <td className={tdCls}>{fmtMoney(s.recurring_amount)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={href} />
    </>
  );
}
