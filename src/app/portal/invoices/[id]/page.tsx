import Link from "next/link";
import { portalPay } from "../../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { InvoiceDocument } from "@/components/invoice-document";
import { Button, Card, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getInvoiceDetail } from "@/lib/invoices";

export default async function PortalInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const { invoice, lines, payments, discounts } = await getInvoiceDetail(id, { customerView: true });

  return (
    <>
      <PageHeader
        title={invoice.number}
        subtitle={invoice.subscription_id ? <Link className="text-brand hover:underline" href={`/portal/subscriptions/${invoice.subscription_id}`}>{invoice.subscription_number}</Link> : undefined}
        actions={
          <>
            <LinkButton variant="secondary" href="/portal/invoices">All invoices</LinkButton>
            <LinkButton variant="secondary" href={`/invoices/${id}/print`}>Print</LinkButton>
          </>
        }
      />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><InvoiceDocument invoice={invoice} lines={lines} payments={payments} discounts={discounts} /></div>
        <div className="no-print">
          {invoice.status === "confirmed" ? (
            <Card title="Pay this invoice">
              <form action={portalPay.bind(null, id)} className="space-y-3">
                <p className="tabular text-2xl font-semibold">{fmtMoney(invoice.amount_due)}</p>
                <p className={`text-sm ${invoice.is_overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                  {invoice.is_overdue ? "Overdue since" : "Due"} {fmtDate(invoice.due_date)}
                </p>
                <Field label="Method">
                  <Select name="method" defaultValue="card">
                    <option value="card">Card</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </Select>
                </Field>
                <Button type="submit" className="w-full">{`Pay ${fmtMoney(invoice.amount_due)}`}</Button>
                <p className="text-xs text-slate-500">Demo payment, recorded instantly against this invoice.</p>
              </form>
            </Card>
          ) : (
            <Card title={invoice.status === "paid" ? "Paid" : "Cancelled"}>
              <p className="text-sm text-slate-500">
                {invoice.status === "paid" ? "Thank you, this invoice is fully paid." : "This invoice was cancelled and doesn't need to be paid."}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
