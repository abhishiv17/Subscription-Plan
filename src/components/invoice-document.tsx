import { StatusBadge } from "@/components/ui";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";

type InvoiceDiscountRow = { discount_id: string; name: string; discount_type: string; value: number; scope: string; amount: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function InvoiceDocument({ invoice, lines, payments, discounts = [] }: { invoice: any; lines: any[]; payments: any[]; discounts?: InvoiceDiscountRow[] }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-brand font-bold text-white">B</div>
          <div className="font-semibold">Brightloop Software</div>
          <div className="text-sm text-slate-500">billing@brightloop.example</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold">Invoice {invoice.number}</div>
          <div className="mt-1"><StatusBadge status={invoice.is_overdue ? "overdue" : invoice.status} /></div>
        </div>
      </header>

      <div className="grid gap-6 py-6 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Bill to</div>
          <div className="mt-1 font-medium">{invoice.customer_name}</div>
          <div className="text-slate-600">{invoice.customer_email}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Dates</div>
          <div className="mt-1">Invoice date: {fmtDate(invoice.invoice_date)}</div>
          <div className={invoice.is_overdue ? "font-medium text-red-600" : ""}>Due date: {fmtDate(invoice.due_date)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Subscription</div>
          <div className="mt-1">{invoice.subscription_number ?? "—"}</div>
          {invoice.period_start && <div className="text-slate-600">{fmtDate(invoice.period_start)} – {fmtDate(invoice.period_end)}</div>}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit price</th>
            <th className="py-2 text-right">Discount</th>
            <th className="py-2 text-right">Tax</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right">{Number(l.quantity)}</td>
              <td className="py-2 text-right">{fmtMoney(l.unit_price)}</td>
              <td className="py-2 text-right">{Number(l.discount_amount) ? `−${fmtMoney(l.discount_amount)}` : "—"}</td>
              <td className="py-2 text-right">{fmtMoney(l.tax_amount)} <span className="text-xs text-slate-400">({Number(l.tax_rate)}%)</span></td>
              <td className="py-2 text-right">{fmtMoney(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-72 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtMoney(invoice.subtotal)}</span></div>
        {Number(invoice.discount_total) > 0 && (
          <div className="flex justify-between text-emerald-700"><span>Discounts</span><span>−{fmtMoney(invoice.discount_total)}</span></div>
        )}
        {discounts.map((d) => (
          <div key={d.discount_id} className="flex justify-between pl-3 text-xs text-emerald-700">
            <span>{d.name} ({d.discount_type === "percent" ? `${Number(d.value)}%` : fmtMoney(d.value)}{d.scope === "product" ? " on products" : ""})</span>
            <span>−{fmtMoney(d.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between"><span className="text-slate-500">Taxes</span><span>{fmtMoney(invoice.tax_total)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold"><span>Total</span><span>{fmtMoney(invoice.total)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>{fmtMoney(invoice.amount_paid)}</span></div>
        <div className="flex justify-between font-semibold"><span>Amount due</span><span>{fmtMoney(invoice.amount_due)}</span></div>
      </div>

      {invoice.notes && (
        <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Notes</div>
          <p className="whitespace-pre-wrap text-slate-600">{invoice.notes}</p>
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Payments</div>
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between py-0.5">
              <span>{fmtDate(p.payment_date)} · {titleCase(p.method)}{p.note ? ` · ${p.note}` : ""}</span>
              <span>{fmtMoney(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
