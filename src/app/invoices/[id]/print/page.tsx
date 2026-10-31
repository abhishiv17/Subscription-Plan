import type { Metadata } from "next";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { LinkButton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices";

export const metadata: Metadata = { title: "Invoice" };

/** Full-page printable invoice outside the app shell. RLS limits customers to their own non-draft invoices. */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("admin", "staff", "customer");
  const { id } = await params;
  const customer = profile.role === "customer";
  const { invoice, lines, payments, discounts } = await getInvoiceDetail(id, { customerView: customer });
  return (
    <main className="print-flat mx-auto min-h-screen max-w-4xl bg-white p-6 sm:p-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <LinkButton variant="secondary" href={customer ? `/portal/invoices/${id}` : `/invoices/${id}`}>Back</LinkButton>
        <PrintButton />
      </div>
      <InvoiceDocument invoice={invoice} lines={lines} payments={payments} discounts={discounts} />
      <p className="mt-6 text-center text-xs text-slate-400">Brightloop Software · Invoice {invoice.number}</p>
    </main>
  );
}
