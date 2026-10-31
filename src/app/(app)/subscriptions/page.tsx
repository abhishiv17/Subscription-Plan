import Link from "next/link";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Input, LinkButton, PageHeader, Pagination, Select, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { SUBSCRIPTION_STATUSES, UUID_RE } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";

const PAGE_SIZE = 25;
const STATUSES = SUBSCRIPTION_STATUSES;

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin", "staff");
  const sp = await searchParams;
  const clean = (v: unknown) => typeof v === "string" ? v.replace(/[^\p{L}\p{N}@._+ -]/gu, "").trim().slice(0,100) : "";
  const q = clean(sp.q), customerSearch = clean(sp.customerSearch);
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status as typeof STATUSES[number]) ? sp.status : "";
  const customer = typeof sp.customer === "string" && UUID_RE.test(sp.customer) ? sp.customer : "";
  const plan = typeof sp.plan === "string" && UUID_RE.test(sp.plan) ? sp.plan : "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(sp.page) || 1)));
  const supabase = await createClient();
  let query = supabase.from("subscription_overview")
    .select("id, number, customer_name, plan_name, billing_period, status, start_date, expiry_date, next_invoice_date, recurring_amount", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);
  if (status) query = query.eq("status", status);
  if (customer) query = query.eq("customer_id", customer);
  if (plan) query = query.eq("plan_id", plan);
  if (q) query = query.or(`number.ilike.%${q}%,customer_name.ilike.%${q}%`);
  let customerQuery = supabase.from("customers").select("id, name, email").order("name").order("id").limit(50);
  if (customerSearch) customerQuery = customerQuery.or(`name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%`);
  const [result, customerResult, planResult, selectedResult] = await Promise.all([
    query, customerQuery, supabase.from("plans").select("id, name").order("name"),
    customer ? supabase.from("customers").select("id, name, email").eq("id", customer).maybeSingle() : Promise.resolve({data:null,error:null}),
  ]);
  for (const r of [result, customerResult, planResult, selectedResult]) if (r.error) throw new Error(r.error.message);
  const { data, count } = result;
  const customers = customerResult.data ?? [], plans = planResult.data ?? [];
  const selectedCustomer = selectedResult.data;
  if (selectedCustomer && !customers.some(c => c.id === selectedCustomer.id)) customers.unshift(selectedCustomer);
  const href = (p: number) => `/subscriptions?${new URLSearchParams({q,status,customer,plan,customerSearch,page:String(p)})}`;

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Every subscription and where it stands"
        actions={<LinkButton href="/subscriptions/new">New subscription</LinkButton>}
      />
      <Flash searchParams={searchParams} />
      <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm">Subscription or customer<Input name="q" placeholder="Number or customer name" defaultValue={q} /></label>
        <label className="text-sm">Status<Select name="status" defaultValue={status}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></label>
        <label className="text-sm">Plan<Select name="plan" defaultValue={plan}><option value="">All plans</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
        <label className="text-sm">Find customer<Input name="customerSearch" defaultValue={customerSearch} placeholder="Name or email; apply to find matches" /></label>
        <label className="text-sm">Customer<Select name="customer" defaultValue={customer}><option value="">All customers</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}</Select></label>
        <div className="flex items-end gap-3"><Button variant="secondary">Apply filters</Button><Link href="/subscriptions" className="pb-2 text-sm text-brand">Reset</Link></div>
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
