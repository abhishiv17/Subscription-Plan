/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import { addLine, billNow, removeLine, renewSubscription, setSubscriptionStatus } from "../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Input, PageHeader, Select, StatusBadge, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

const STEPS = ["draft", "quotation", "confirmed", "active", "closed"];

export default async function SubscriptionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: s }, { data: lines }, { data: invoices }, { data: products }, { data: taxes }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, customers(id, name, email, company), plans(*), quotation_templates(name), discounts(name, discount_type, value)")
      .eq("id", id)
      .single(),
    supabase
      .from("subscription_lines")
      .select("id, quantity, unit_price, amount, description, products(name), product_variants(attribute, value), taxes(name, rate)")
      .eq("subscription_id", id),
    supabase
      .from("invoice_overview")
      .select("id, number, status, invoice_date, period_start, period_end, total, amount_due, is_overdue")
      .eq("subscription_id", id)
      .order("period_start", { ascending: false }),
    supabase.from("products").select("id, name, sales_price, product_variants(id, attribute, value, extra_price)").eq("active", true).order("name"),
    supabase.from("taxes").select("id, name").eq("active", true),
  ]);
  if (!s) notFound();

  const plan = s.plans;
  const editable = s.status === "draft" || s.status === "quotation";
  const untaxed = (lines ?? []).reduce((sum, l) => sum + Number(l.amount), 0);
  const tax = (lines ?? []).reduce((sum, l) => sum + Number(l.amount) * Number((l.taxes as unknown as { rate: number } | null)?.rate ?? 0) / 100, 0);
  const status = (to: string) => setSubscriptionStatus.bind(null, s.id, to);
  const stepIndex = STEPS.indexOf(s.status === "paused" ? "active" : s.status);

  return (
    <>
      <PageHeader
        title={s.number}
        subtitle={
          <>
            <Link className="text-brand hover:underline" href={`/customers/${s.customers.id}`}>{s.customers.name}</Link> · {plan.name} ({plan.billing_period})
          </>
        }
        actions={
          <>
            {s.status === "draft" && <form action={status("quotation")}><Button variant="secondary">Send quotation</Button></form>}
            {s.status === "quotation" && <form action={status("draft")}><Button variant="secondary">Back to draft</Button></form>}
            {(s.status === "draft" || s.status === "quotation") && <form action={status("confirmed")}><Button>Confirm</Button></form>}
            {s.status === "confirmed" && <form action={status("active")}><Button>Activate</Button></form>}
            {s.status === "active" && <form action={billNow.bind(null, s.id)}><Button>Create invoice now</Button></form>}
            {s.status === "active" && plan.pausable && <form action={status("paused")}><Button variant="secondary">Pause</Button></form>}
            {s.status === "paused" && <form action={status("active")}><Button>Resume</Button></form>}
            {(s.status === "active" || s.status === "paused") && plan.renewable && (
              <form action={renewSubscription.bind(null, s.id)}><Button variant="secondary">Renew</Button></form>
            )}
            {s.status !== "closed" && (s.status !== "active" && s.status !== "paused" || plan.closable) && (
              <form action={status("closed")}><Button variant="danger">{s.status === "active" || s.status === "paused" ? "Close" : "Cancel"}</Button></form>
            )}
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                i === stepIndex ? "bg-brand text-white" : i < stepIndex ? "bg-brand-light text-brand" : "bg-slate-100 text-slate-400"
              }`}
            >
              {step === "active" && s.status === "paused" ? "Paused" : step[0].toUpperCase() + step.slice(1)}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Status</dt><dd><StatusBadge status={s.status} /></dd>
            <dt className="text-slate-500">Start date</dt><dd>{fmtDate(s.start_date)}</dd>
            <dt className="text-slate-500">Expiry date</dt><dd>{fmtDate(s.expiry_date)}</dd>
            <dt className="text-slate-500">Payment terms</dt><dd>{s.payment_terms_days ? `${s.payment_terms_days} days` : "Immediate"}</dd>
            <dt className="text-slate-500">Next invoice</dt><dd>{s.status === "active" ? fmtDate(s.next_invoice_date) : "—"}</dd>
            {s.quotation_valid_until && (<><dt className="text-slate-500">Quote valid until</dt><dd>{fmtDate(s.quotation_valid_until)}</dd></>)}
            {s.quotation_templates && (<><dt className="text-slate-500">Template</dt><dd>{s.quotation_templates.name}</dd></>)}
            {s.discounts && (<><dt className="text-slate-500">Discount</dt><dd>{s.discounts.name}</dd></>)}
            <dt className="text-slate-500">Plan rules</dt>
            <dd className="text-xs text-slate-600">
              Min qty {plan.min_quantity}
              {plan.auto_close && " · auto-closes"}
              {plan.pausable ? " · pausable" : " · no pause"}
              {plan.closable ? " · closable" : " · no early close"}
              {plan.renewable ? " · renewable" : ""}
            </dd>
          </dl>
          {s.notes && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{s.notes}</p>}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Table head={["Product", "Qty", "Unit price", "Tax", "Amount", ""]} empty={!lines?.length}>
            {(lines as any[] | null)?.map((l) => (
              <tr key={l.id}>
                <td className={tdCls}>
                  {l.description ?? l.products?.name}
                  {l.product_variants && <span className="text-xs text-slate-500"> · {l.product_variants.attribute}: {l.product_variants.value}</span>}
                </td>
                <td className={tdCls}>{Number(l.quantity)}</td>
                <td className={tdCls}>{fmtMoney(l.unit_price)}</td>
                <td className={tdCls}>{l.taxes?.name ?? "—"}</td>
                <td className={tdCls}>{fmtMoney(l.amount)}</td>
                <td className={`${tdCls} text-right`}>
                  {editable && (
                    <form action={removeLine.bind(null, s.id, l.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <div className="ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Untaxed</span><span>{fmtMoney(untaxed)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Taxes</span><span>{fmtMoney(tax)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Total per period</span><span>{fmtMoney(untaxed + tax)}</span></div>
          </div>

          {editable && (
            <Card title="Add product line">
              <form action={addLine.bind(null, s.id)} className="grid gap-3 sm:grid-cols-5">
                <div className="sm:col-span-2">
                  <Select name="product" required defaultValue="">
                    <option value="">Product…</option>
                    {products?.map((p) =>
                      p.product_variants.length ? (
                        p.product_variants.map((v: { id: string; attribute: string; value: string; extra_price: number }) => (
                          <option key={v.id} value={`${p.id}|${v.id}`}>
                            {p.name} · {v.attribute}: {v.value} ({fmtMoney(Number(p.sales_price) + Number(v.extra_price))})
                          </option>
                        ))
                      ) : (
                        <option key={p.id} value={p.id}>{p.name} ({fmtMoney(p.sales_price)})</option>
                      ),
                    )}
                  </Select>
                </div>
                <Input name="quantity" type="number" min="0.01" step="0.01" defaultValue={1} placeholder="Qty" />
                <Input name="unit_price" type="number" min="0" step="0.01" placeholder="Price (auto)" />
                <Select name="tax_id" defaultValue="">
                  <option value="">Product&apos;s tax</option>
                  {taxes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                <div className="sm:col-span-5"><Button type="submit">Add line</Button></div>
              </form>
            </Card>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">Invoices</h2>
      <Table head={["Invoice", "Period", "Status", "Total", "Due"]} empty={!invoices?.length}>
        {invoices?.map((i) => (
          <tr key={i.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
            <td className={tdCls}>{fmtDate(i.period_start)} – {fmtDate(i.period_end)}</td>
            <td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td>
            <td className={tdCls}>{fmtMoney(i.total)}</td>
            <td className={tdCls}>{fmtMoney(i.amount_due)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
