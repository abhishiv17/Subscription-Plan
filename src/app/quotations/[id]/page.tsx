import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { LinkButton } from "@/components/ui";
import { Wordmark } from "@/components/logo";
import { requireRole } from "@/lib/auth";
import { getSubscriptionDetail } from "@/lib/subscription-detail";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function QuotationPage({ params }: { params: Promise<{id: string}> }) {
  const profile = await requireRole("admin", "staff", "customer");
  const { id } = await params;
  // Session client and RLS restrict customers to their own quotation.
  const { subscription: s, lines, subtotal, tax, total } = await getSubscriptionDetail(id);
  if (profile.role === "customer" && (!s.quotation_valid_until || s.status === "draft")) notFound();
  const expired = s.quotation_valid_until && s.quotation_valid_until < new Date().toISOString().slice(0,10);
  return <main className="print-flat mx-auto min-h-screen max-w-4xl bg-white p-6 sm:p-10">
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3"><LinkButton variant="secondary" href={profile.role === "customer" ? "/portal" : `/subscriptions/${id}`}>Back</LinkButton><PrintButton /></div>
    <article><header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-6"><div><Wordmark /><p className="mt-3 text-sm text-slate-600">Quotation for recurring services</p></div><div className="text-right"><h1 className="text-2xl font-semibold">Quotation {s.number}</h1><p className="mt-2 text-sm">Valid until: <strong>{fmtDate(s.quotation_valid_until)}</strong></p>{expired && <p className="mt-1 text-sm font-semibold text-red-700">Expired quotation</p>}</div></header>
    {(!s.quotation_valid_until || s.status === "draft") && <p className="my-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Draft preview. Issue the quotation to set its valid-until date.</p>}
    <div className="grid gap-6 py-6 text-sm sm:grid-cols-2"><div><h2 className="font-semibold">Prepared for</h2><p>{s.customers.name}</p>{s.customers.company && <p>{s.customers.company}</p>}<p>{s.customers.email}</p>{s.customers.address && <p className="whitespace-pre-wrap">{s.customers.address}</p>}</div><div><h2 className="font-semibold">Subscription terms</h2><p>{s.plans.name} - billed {s.plans.billing_period}</p><p>Starts: {fmtDate(s.start_date)}</p><p>Ends: {fmtDate(s.expiry_date)}</p><p>Payment terms: {s.payment_terms_days ? `${s.payment_terms_days} days` : "Immediate"}</p></div></div>
    <div className="overflow-x-auto print:overflow-visible"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-left"><th className="py-3">Description</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Unit price</th><th className="py-3 text-right">Tax</th><th className="py-3 text-right">Subtotal</th></tr></thead><tbody>{lines.map(l => <tr key={l.id} className="break-inside-avoid border-b border-slate-100"><td className="py-3">{l.description || l.products?.name}{l.product_variants && <span className="block text-xs text-slate-500">{l.product_variants.attribute}: {l.product_variants.value}</span>}</td><td className="py-3 text-right">{Number(l.quantity)}</td><td className="py-3 text-right">{fmtMoney(l.unit_price)}</td><td className="py-3 text-right">{Number(l.taxes?.rate ?? 0)}%</td><td className="py-3 text-right">{fmtMoney(l.amount)}</td></tr>)}</tbody></table></div>
    <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-2 text-sm"><dt>Subtotal</dt><dd className="text-right">{fmtMoney(subtotal)}</dd><dt>Tax</dt><dd className="text-right">{fmtMoney(tax)}</dd><dt className="border-t border-slate-200 pt-2 font-semibold">Per-period estimate</dt><dd className="border-t border-slate-200 pt-2 text-right font-semibold">{fmtMoney(total)}</dd></dl>
    <p className="mt-4 text-xs text-slate-500">Prices are shown before eligible discounts. Discounts are calculated on the invoice date.</p>
    {s.notes && <section className="mt-6 border-t border-slate-200 pt-5"><h2 className="text-sm font-semibold">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{s.notes}</p></section>}
    </article>
  </main>;
}
