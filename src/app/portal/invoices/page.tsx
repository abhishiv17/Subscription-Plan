import Link from "next/link";
import { PageHeader, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function PortalInvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoice_overview")
    .select("id, number, subscription_number, status, invoice_date, due_date, total, amount_due, is_overdue")
    .neq("status", "draft")
    .order("invoice_date", { ascending: false });

  return (
    <>
      <PageHeader title="My invoices" />
      <Table head={["Invoice", "Subscription", "Date", "Due", "Status", "Total", "To pay"]} empty={!invoices?.length}>
        {invoices?.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
            <td className={tdCls}>{i.subscription_number}</td>
            <td className={tdCls}>{fmtDate(i.invoice_date)}</td>
            <td className={tdCls}>{fmtDate(i.due_date)}</td>
            <td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td>
            <td className={tdCls}>{fmtMoney(i.total)}</td>
            <td className={tdCls}>{i.status === "confirmed" ? fmtMoney(i.amount_due) : "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
