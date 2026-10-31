import { Fragment } from "react";
import Link from "next/link";
import { billNow, removeLine, renewSubscription, setSubscriptionStatus } from "../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, LinkButton, PageHeader, Pagination, StatusBadge, Table, tdCls } from "@/components/ui";
import { SubscriptionLineForm } from "@/components/subscription-line-form";
import { requireRole } from "@/lib/auth";
import { getSubscriptionDetail } from "@/lib/subscription-detail";
import { allowedTransitions, linesEditable, SUBSCRIPTION_STATUSES } from "@/lib/subscriptions";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";

export default async function SubscriptionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireRole("admin", "staff");
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(sp.page) || 1)));
  const { subscription: s, lines, subtotal, tax, total } = await getSubscriptionDetail(id);
  const supabase = await createClient();
  const editable = linesEditable(s.status);
  const [{ data: invoices, count, error }, { data: products, error: productError }, { data: taxes, error: taxError }] = await Promise.all([
    supabase.from("invoice_overview").select("id, number, status, period_start, period_end, total, amount_due, is_overdue", { count: "exact" }).eq("subscription_id", id).order("invoice_date", { ascending: false }).order("id").range((page-1)*20, page*20-1),
    editable ? supabase.from("products").select("id, name, active, sales_price, tax_id, product_variants(id, attribute, value, extra_price)").order("name") : Promise.resolve({data: [], error: null}),
    editable ? supabase.from("taxes").select("id, name, active, rate").order("rate") : Promise.resolve({data: [], error: null}),
  ]);
  for (const e of [error, productError, taxError]) if (e) throw new Error(e.message);
  const today = new Date().toISOString().slice(0,10);
  const expiredQuote = s.status === "quotation" && !!s.quotation_valid_until && s.quotation_valid_until < today;
  const transitions = allowedTransitions(s.status, s.plans, s.expiry_date ?? s.plans.end_date, today).filter(t => !(expiredQuote && t === "confirmed"));
  const labels: Record<string, string> = { quotation: "Send quotation", draft: "Back to draft", confirmed: "Confirm", active: s.status === "paused" ? "Resume" : "Activate", paused: "Pause", closed: ["draft", "quotation", "confirmed"].includes(s.status) ? "Cancel" : "Close" };
  const canBill = s.status === "active" && (!s.expiry_date || (s.next_invoice_date ?? s.start_date) <= s.expiry_date);
  return <>
    <PageHeader title={s.number} subtitle={<><Link className="text-brand hover:underline" href={`/customers/${s.customers.id}`}>{s.customers.name}</Link> - {s.plans.name} ({s.plans.billing_period})</>} actions={<>
      <LinkButton variant="secondary" href={`/quotations/${id}`}>{s.quotation_valid_until ? "View quotation" : "Preview quotation"}</LinkButton>
      {transitions.map(target => <form key={target} action={setSubscriptionStatus.bind(null, id, target)}><Button variant={target === "closed" ? "danger" : "secondary"}>{labels[target]}</Button></form>)}
      {canBill && <form action={billNow.bind(null, id)}><Button>Bill now</Button></form>}
      {["active", "paused"].includes(s.status) && s.plans.renewable && <form action={renewSubscription.bind(null, id)}><Button variant="secondary">Renew</Button></form>}
    </>} />
    <Flash searchParams={searchParams} />
    {expiredQuote && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This quotation has expired. Return it to draft and issue a new quotation before confirming.</p>}
    {s.status === "active" && !canBill && <p className="mb-4 text-sm text-slate-600">The next billing period is beyond this subscription&apos;s expiry date. Renew before billing again.</p>}
    <ol aria-label="Subscription lifecycle" className="mb-6 flex flex-wrap items-center gap-2 text-sm">{SUBSCRIPTION_STATUSES.map((step,i) => <li key={step} className="flex items-center gap-2"><span aria-current={s.status === step ? "step" : undefined} className={`rounded-full px-3 py-1 ${s.status === step ? "bg-brand font-semibold text-white" : "bg-slate-100 text-slate-600"}`}>{titleCase(step)}</span>{i < 5 && <span aria-hidden>{i === 3 ? "↔" : "→"}</span>}</li>)}</ol>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Details"><dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>Status</dt><dd><StatusBadge status={s.status} /></dd><dt>Start date</dt><dd>{fmtDate(s.start_date)}</dd><dt>Expiry date</dt><dd>{fmtDate(s.expiry_date)}</dd>
        <dt>Payment terms</dt><dd>{s.payment_terms_days ? `${s.payment_terms_days} days` : "Immediate"}</dd><dt>Next invoice</dt><dd>{fmtDate(s.next_invoice_date)}</dd>
        <dt>Quote valid until</dt><dd>{fmtDate(s.quotation_valid_until)}</dd>
        {s.quotation_templates && <><dt>Template</dt><dd>{s.quotation_templates.name}</dd></>}{s.discounts && <><dt>Discount</dt><dd>{s.discounts.name}</dd></>}
        <dt>Plan rules</dt><dd>Minimum quantity {s.plans.min_quantity}{s.plans.auto_close ? "; auto-close" : ""}{s.plans.pausable ? "; pausable" : ""}{s.plans.closable ? "; closable" : ""}{s.plans.renewable ? "; renewable" : ""}</dd>
      </dl>{s.notes && <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm text-slate-600">{s.notes}</p>}</Card>
      <div className="space-y-4 lg:col-span-2">
        {!editable && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Lines are locked after confirmation.</p>}
        <Table head={["Product", "Qty", "Unit price", "Tax", "Amount", ""]} empty={!lines.length}>{lines.map(l => <Fragment key={l.id}><tr>
          <td className={tdCls}>{l.description || l.products?.name}{l.product_variants && <span className="block text-xs text-slate-500">{l.product_variants.attribute}: {l.product_variants.value}</span>}</td><td className={tdCls}>{Number(l.quantity)}</td><td className={tdCls}>{fmtMoney(l.unit_price)}</td><td className={tdCls}>{l.taxes?.name ?? "-"}</td><td className={tdCls}>{fmtMoney(l.amount)}</td>
          <td className={tdCls}>{editable && <form action={removeLine.bind(null,id,l.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>}</td>
        </tr>{editable && <tr><td colSpan={6} className="border-b border-slate-100 px-4 py-3"><details><summary className="cursor-pointer text-sm font-medium text-brand">Edit line</summary><div className="mt-4"><SubscriptionLineForm subscriptionId={id} line={l} products={products ?? []} taxes={taxes ?? []} /></div></details></td></tr>}</Fragment>)}</Table>
        <div className="ml-auto max-w-sm space-y-1 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div><div className="flex justify-between"><span>Tax</span><span>{fmtMoney(tax)}</span></div><div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Per-period estimate</span><span>{fmtMoney(total)}</span></div><p className="text-xs text-slate-500">Before eligible discounts, calculated when invoiced.</p></div>
        {editable && <Card title="Add product line"><SubscriptionLineForm subscriptionId={id} products={products ?? []} taxes={taxes ?? []} /></Card>}
      </div>
    </div>
    <h2 className="mb-3 mt-8 text-lg font-semibold">Invoices</h2>
    <Table head={["Invoice", "Period", "Status", "Total", "Due"]} empty={!invoices?.length}>{invoices?.map(i => <tr key={i.id}><td className={tdCls}><Link className="text-brand hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td><td className={tdCls}>{fmtDate(i.period_start)} - {fmtDate(i.period_end)}</td><td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td><td className={tdCls}>{fmtMoney(i.total)}</td><td className={tdCls}>{fmtMoney(i.amount_due)}</td></tr>)}</Table>
    <Pagination page={page} pageSize={20} total={count ?? 0} href={p => `/subscriptions/${id}?page=${p}`} />
  </>;
}
