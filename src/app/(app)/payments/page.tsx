import Link from "next/link";
import { type SearchParams } from "@/components/flash";
import { Button, Input, PageHeader, Pagination, Select, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";

const PAGE_SIZE = 25;
const METHODS = ["bank_transfer", "card", "upi", "cash", "cheque", "other"];

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const method = typeof sp.method === "string" ? sp.method : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("payments")
    .select("id, method, amount, payment_date, note, invoices(id, number, customers(name))", { count: "exact" })
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (method) query = query.eq("method", method);
  if (from) query = query.gte("payment_date", from);
  if (to) query = query.lte("payment_date", to);
  const { data, count, error } = await query;
  if (error) throw error;

  const href = (p: number) => `/payments?${new URLSearchParams({ method, from, to, page: String(p) })}`;

  return (
    <>
      <PageHeader title="Payments" subtitle="Every payment recorded against an invoice" />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Select name="method" defaultValue={method}>
            <option value="">All methods</option>
            {METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
          </Select>
        </div>
        <label className="text-xs text-slate-500">From<Input type="date" name="from" defaultValue={from} /></label>
        <label className="text-xs text-slate-500">To<Input type="date" name="to" defaultValue={to} /></label>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      <Table head={["Date", "Invoice", "Customer", "Method", "Note", "Amount"]} empty={!data?.length}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {data?.map((p: any) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <td className={tdCls}>{fmtDate(p.payment_date)}</td>
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/invoices/${p.invoices.id}`}>{p.invoices.number}</Link></td>
            <td className={tdCls}>{p.invoices.customers.name}</td>
            <td className={tdCls}>{titleCase(p.method)}</td>
            <td className={`${tdCls} text-slate-500`}>{p.note ?? "—"}</td>
            <td className={`${tdCls} font-medium`}>{fmtMoney(p.amount)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={href} />
    </>
  );
}
