import Link from "next/link";
import { Flash, type SearchParams } from "@/components/flash";
import { PageHeader, Pagination, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { pageParam } from "@/lib/invoices";

const PAGE_SIZE = 20;
const FILTERS = { "": "All", outstanding: "To pay", overdue: "Overdue", paid: "Paid", cancelled: "Cancelled" } as const;

export default async function PortalInvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filter = (typeof sp.filter === "string" && sp.filter in FILTERS ? sp.filter : "") as keyof typeof FILTERS;
  const page = pageParam(sp.page);
  const supabase = await createClient();
  // RLS limits rows to the signed-in customer; drafts are internal and never shown.
  let query = supabase
    .from("invoice_overview")
    .select("id, number, subscription_id, subscription_number, status, invoice_date, due_date, total, amount_due, is_overdue", { count: "exact" })
    .neq("status", "draft")
    .order("invoice_date", { ascending: false })
    .order("number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filter === "outstanding") query = query.eq("status", "confirmed");
  else if (filter === "overdue") query = query.eq("is_overdue", true);
  else if (filter) query = query.eq("status", filter);
  const { data: invoices, count, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="My invoices" subtitle="Download, print or pay your invoices" />
      <Flash searchParams={searchParams} />
      <div className="mb-4 flex flex-wrap gap-1">
        {Object.entries(FILTERS).map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/portal/invoices?filter=${key}` : "/portal/invoices"}
            className={`rounded-full px-3 py-1 text-sm ${filter === key ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <Table head={["Invoice", "Subscription", "Date", "Due", "Status", "Total", "To pay"]} empty={!invoices?.length}>
        {invoices?.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
            <td className={tdCls}>{i.subscription_id ? <Link className="hover:underline" href={`/portal/subscriptions/${i.subscription_id}`}>{i.subscription_number}</Link> : "—"}</td>
            <td className={tdCls}>{fmtDate(i.invoice_date)}</td>
            <td className={`${tdCls} ${i.is_overdue ? "font-medium text-red-600" : ""}`}>{fmtDate(i.due_date)}</td>
            <td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td>
            <td className={tdCls}>{fmtMoney(i.total)}</td>
            <td className={tdCls}>{i.status === "confirmed" ? fmtMoney(i.amount_due) : "—"}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => `/portal/invoices?${new URLSearchParams({ ...(filter ? { filter } : {}), page: String(p) })}`} />
    </>
  );
}
