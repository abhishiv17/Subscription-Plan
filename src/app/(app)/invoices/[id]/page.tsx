import Link from "next/link";
import { deletePayment, recordPayment, sendInvoice, setInvoiceStatus } from "../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { InvoiceDocument } from "@/components/invoice-document";
import { Button, Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/lib/constants";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";
import { getInvoiceDetail } from "@/lib/invoices";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const profile = await requireRole("admin", "staff");
  const { id } = await params;
  const { invoice, lines, payments, discounts } = await getInvoiceDetail(id);
  const canCancel = invoice.status === "draft" || (invoice.status === "confirmed" && Number(invoice.amount_paid) === 0);
  const canSend = invoice.status !== "cancelled";

  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={
          <>
            <Link className="text-brand hover:underline" href={`/customers/${invoice.customer_id}`}>{invoice.customer_name}</Link>
            {invoice.subscription_id && (
              <> · <Link className="text-brand hover:underline" href={`/subscriptions/${invoice.subscription_id}`}>{invoice.subscription_number}</Link></>
            )}
            {invoice.sent_at ? <> · sent {fmtDate(invoice.sent_at)}</> : invoice.status !== "draft" && invoice.status !== "cancelled" && <> · not sent yet</>}
            {invoice.reminder_count > 0 && <> · {`${invoice.reminder_count} overdue reminder${invoice.reminder_count === 1 ? "" : "s"}, last ${fmtDate(invoice.last_reminder_at)}`}</>}
          </>
        }
        actions={
          <>
            {invoice.status === "draft" && <form action={setInvoiceStatus.bind(null, id, "confirmed")}><Button>Confirm</Button></form>}
            {canSend && (
              <form action={sendInvoice.bind(null, id)}>
                <Button variant="secondary">{invoice.sent_at ? "Mark sent again" : invoice.status === "draft" ? "Confirm and mark sent" : "Mark sent"}</Button>
              </form>
            )}
            <LinkButton variant="secondary" href={`/invoices/${id}/print`}>Print</LinkButton>
            {canCancel && <form action={setInvoiceStatus.bind(null, id, "cancelled")}><Button variant="danger">Cancel invoice</Button></form>}
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoiceDocument invoice={invoice} lines={lines} payments={payments} discounts={discounts} />
        </div>
        <div className="no-print space-y-4">
          {invoice.status === "confirmed" ? (
            <Card title="Record payment">
              <form action={recordPayment.bind(null, id)} className="space-y-3">
                <Field label="Amount" hint={`${fmtMoney(invoice.amount_due)} still due`}>
                  <Input name="amount" type="number" step="0.01" min="0.01" max={invoice.amount_due} defaultValue={invoice.amount_due} required />
                </Field>
                <Field label="Method">
                  <Select name="method" defaultValue="bank_transfer">
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
                  </Select>
                </Field>
                <Field label="Date"><Input name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
                <Field label="Note"><Input name="note" maxLength={200} placeholder="e.g. bank reference" /></Field>
                <Button type="submit" className="w-full">Record payment</Button>
              </form>
            </Card>
          ) : (
            <Card title="Payments">
              <p className="text-sm text-slate-500">
                {invoice.status === "draft" && "Confirm the invoice before recording payments. Customers can't see drafts."}
                {invoice.status === "paid" && "This invoice is fully paid."}
                {invoice.status === "cancelled" && "This invoice was cancelled."}
              </p>
            </Card>
          )}
          {profile.role === "admin" && payments.length > 0 && (
            <Card title="Correct a payment">
              <p className="mb-3 text-xs text-slate-500">Remove a payment recorded by mistake. The amount due and status update automatically.</p>
              <ul className="divide-y divide-slate-100 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{fmtDate(p.payment_date)} · {titleCase(p.method)} · {fmtMoney(p.amount)}</span>
                    <form action={deletePayment.bind(null, id, p.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
