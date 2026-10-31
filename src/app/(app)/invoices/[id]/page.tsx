import Link from "next/link";
import { notFound } from "next/navigation";
import { recordPayment, sendInvoice, setInvoiceStatus } from "../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

const METHODS = ["bank_transfer", "card", "upi", "cash", "cheque", "other"];

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invoice }, { data: lines }, { data: payments }] = await Promise.all([
    supabase.from("invoice_overview").select("*").eq("id", id).single(),
    supabase.from("invoice_lines").select("*").eq("invoice_id", id),
    supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date"),
  ]);
  if (!invoice) notFound();

  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={
          <>
            {invoice.subscription_id && (
              <Link className="text-brand hover:underline" href={`/subscriptions/${invoice.subscription_id}`}>{invoice.subscription_number}</Link>
            )}
            {invoice.sent_at && <> · sent {fmtDate(invoice.sent_at)}</>}
          </>
        }
        actions={
          <>
            {invoice.status === "draft" && <form action={setInvoiceStatus.bind(null, id, "confirmed")}><Button>Confirm</Button></form>}
            {invoice.status !== "cancelled" && <form action={sendInvoice.bind(null, id)}><Button variant="secondary">Send</Button></form>}
            <PrintButton />
            {(invoice.status === "draft" || (invoice.status === "confirmed" && Number(invoice.amount_paid) === 0)) && (
              <form action={setInvoiceStatus.bind(null, id, "cancelled")}><Button variant="danger">Cancel</Button></form>
            )}
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoiceDocument invoice={invoice} lines={lines ?? []} payments={payments ?? []} />
        </div>
        <div className="no-print">
          {invoice.status === "confirmed" ? (
            <Card title="Record payment">
              <form action={recordPayment.bind(null, id)} className="space-y-3">
                <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" max={invoice.amount_due} defaultValue={invoice.amount_due} required /></Field>
                <Field label="Method">
                  <Select name="method" defaultValue="bank_transfer">
                    {METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
                  </Select>
                </Field>
                <Field label="Date"><Input name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                <Field label="Note"><Input name="note" placeholder="e.g. bank reference" /></Field>
                <Button type="submit" className="w-full">Record payment</Button>
              </form>
            </Card>
          ) : (
            <Card title="Payments">
              <p className="text-sm text-slate-500">
                {invoice.status === "draft" && "Confirm the invoice before recording payments."}
                {invoice.status === "paid" && "This invoice is fully paid."}
                {invoice.status === "cancelled" && "This invoice was cancelled."}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
