import Link from "next/link";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Input, PageHeader, Pagination, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { dateParam, pageParam, uuidParam } from "@/lib/invoices";

const PAGE_SIZE = 25;
const FILTERS = {
  "": "All invoices",
  outstanding: "Outstanding",
  overdue: "Overdue",
  draft: "Draft",
  confirmed: "Confirmed",
  paid: "Paid",
  cancelled: "Cancelled",
} as const;

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[,()%*]/g, "").trim() : "";
  const filter = (typeof sp.filter === "string" && sp.filter in FILTERS ? sp.filter : "") as keyof typeof FILTERS;
  const from = dateParam(sp.from);
  const to = dateParam(sp.to);
  const customer = uuidParam(sp.customer);
  const page = pageParam(sp.page);

  const supabase = await createClient();
  const { data: customerRow } = customer
    ? await supabase.from("customers").select("id, name").eq("id", customer).maybeSingle()
    : { data: null };
  let query = supabase
    .from("invoice_overview")
    .select("id, number, customer_name, subscription_number, status, invoice_date, due_date, total, amount_due, is_overdue", { count: "exact" })
    .order("invoice_date", { ascending: false })
    .order("number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filter === "outstanding") query = query.eq("status", "confirmed");
  else if (filter === "overdue") query = query.eq("is_overdue", true);
  else if (filter) query = query.eq("status", filter);
  if (from) query = query.gte("invoice_date", from);
  if (to) query = query.lte("invoice_date", to);
  if (customer) query = query.eq("customer_id", customer);
  if (q) query = query.or(`number.ilike.%${q}%,customer_name.ilike.%${q}%,subscription_number.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) throw error;

  const params = (extra: Record<string, string>) => new URLSearchParams({ q, filter, from, to, ...(customer ? { customer } : {}), ...extra });
  const href = (p: number) => `/invoices?${params({ page: String(p) })}`;

  return (
    <>
      <PageHeader title="Invoices" subtitle="Created automatically from subscriptions on billing day" />
      <Flash searchParams={searchParams} />
      {customer && (
        <p className="mb-3 text-sm text-slate-600">
          Showing invoices for <Link className="font-medium text-brand hover:underline" href={`/customers/${customer}`}>{customerRow?.name ?? "this customer"}</Link> ·{" "}
          <Link className="text-brand hover:underline" href={`/invoices?${new URLSearchParams({ q, filter, from, to })}`}>show all customers</Link>
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-1">
        {Object.entries(FILTERS).map(([key, label]) => (
          <Link
            key={key}
            href={`/invoices?${params({ filter: key })}`}
            className={`rounded-full px-3 py-1 text-sm ${filter === key ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="filter" value={filter} />
        {customer && <input type="hidden" name="customer" value={customer} />}
        <div className="w-64"><Input name="q" placeholder="Invoice, customer or subscription" defaultValue={q} /></div>
        <label className="text-xs text-slate-500">From<Input type="date" name="from" defaultValue={from} /></label>
        <label className="text-xs text-slate-500">To<Input type="date" name="to" defaultValue={to} /></label>
        <Button variant="secondary" type="submit">Search</Button>
      </form>
      <Table head={["Invoice", "Customer", "Subscription", "Date", "Due", "Status", "Total", "Amount due"]} empty={!data?.length}>
        {data?.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
            <td className={tdCls}>{i.customer_name}</td>
            <td className={tdCls}>{i.subscription_number ?? "—"}</td>
            <td className={tdCls}>{fmtDate(i.invoice_date)}</td>
            <td className={`${tdCls} ${i.is_overdue ? "font-medium text-red-600" : ""}`}>{fmtDate(i.due_date)}</td>
            <td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td>
            <td className={tdCls}>{fmtMoney(i.total)}</td>
            <td className={tdCls}>{i.status === "cancelled" ? "—" : fmtMoney(i.amount_due)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={href} />
    </>
  );
}
