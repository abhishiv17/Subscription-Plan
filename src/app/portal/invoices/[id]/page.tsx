import { notFound } from "next/navigation";
import { portalPay } from "../../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { Button, Card, Field, PageHeader, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";

export default async function PortalInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invoice }, { data: lines }, { data: payments }] = await Promise.all([
    supabase.from("invoice_overview").select("*").eq("id", id).neq("status", "draft").single(),
    supabase.from("invoice_lines").select("*").eq("invoice_id", id),
    supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date"),
  ]);
  if (!invoice) notFound();

  return (
    <>
      <PageHeader title={invoice.number} actions={<PrintButton />} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><InvoiceDocument invoice={invoice} lines={lines ?? []} payments={payments ?? []} /></div>
        {invoice.status === "confirmed" && (
          <div className="no-print">
            <Card title="Pay this invoice">
              <form action={portalPay.bind(null, id)} className="space-y-3">
                <p className="text-2xl font-semibold">{fmtMoney(invoice.amount_due)}</p>
                <Field label="Method">
                  <Select name="method" defaultValue="card">
                    <option value="card">Card</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </Select>
                </Field>
                <Button type="submit" className="w-full">Pay now</Button>
                <p className="text-xs text-slate-500">Demo payment, recorded instantly against this invoice.</p>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
