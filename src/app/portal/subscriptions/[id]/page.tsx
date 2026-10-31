import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash, type SearchParams } from "@/components/flash";
import { PortalSubscriptionControls } from "@/components/portal-subscription-controls";
import { SubscriptionHistory, type SubscriptionEvent } from "@/components/subscription-history";
import { Card, LinkButton, PageHeader, Pagination, StatusBadge, Table, tdCls } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { pageParam } from "@/lib/invoices";
import { getSubscriptionDetail } from "@/lib/subscription-detail";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;
const PERIOD_UNIT: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

export default async function PortalSubscriptionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const page = pageParam(sp.page);
  // Session client: RLS returns only the signed-in customer's own subscription.
  const { subscription: s, lines, subtotal, tax, total } = await getSubscriptionDetail(id);
  if (s.status === "draft") notFound();
  const supabase = await createClient();
  const [profile, invoices, events] = await Promise.all([
    getProfile(),
    supabase
      .from("invoice_overview")
      .select("id, number, status, period_start, period_end, due_date, total, amount_due, is_overdue", { count: "exact" })
      .eq("subscription_id", id)
      .neq("status", "draft")
      .order("invoice_date", { ascending: false })
      .order("id")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("subscription_events").select("id, event, from_status, to_status, expiry_date, actor, created_at").eq("subscription_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  for (const r of [invoices, events]) if (r.error) throw new Error(r.error.message);
  const back = `/portal/subscriptions/${id}`;
  const actorName = (actor: string | null) => (actor === null ? "Automatic" : actor === profile?.id ? "You" : "Brightloop team");

  return (
    <>
      <PageHeader
        title={s.number}
        subtitle={<>{s.plans.name} · billed {s.plans.billing_period}</>}
        actions={
          <>
            <LinkButton variant="secondary" href="/portal">All subscriptions</LinkButton>
            {s.quotation_valid_until && <LinkButton variant="secondary" href={`/quotations/${id}`}>View quotation</LinkButton>}
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="What you subscribe to">
            <Table head={["Product", "Qty", "Unit price", "Tax", "Amount"]} empty={!lines.length}>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className={tdCls}>
                    {l.description || l.products?.name}
                    {l.product_variants && <span className="block text-xs text-slate-500">{l.product_variants.attribute}: {l.product_variants.value}</span>}
                  </td>
                  <td className={tdCls}>{Number(l.quantity)}</td>
                  <td className={tdCls}>{fmtMoney(l.unit_price)}</td>
                  <td className={tdCls}>{Number(l.taxes?.rate ?? 0)}%</td>
                  <td className={tdCls}>{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </Table>
            <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{fmtMoney(tax)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>{`Per ${PERIOD_UNIT[s.plans.billing_period] ?? "period"}`}</span><span>{fmtMoney(total)}</span></div>
              <p className="text-xs text-slate-500">Eligible discounts are applied on each invoice.</p>
            </div>
          </Card>

          <Card title="Invoices">
            <Table head={["Invoice", "Period", "Due", "Status", "Total", "To pay"]} empty={!invoices.data?.length}>
              {invoices.data?.map((i) => (
                <tr key={i.id}>
                  <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/portal/invoices/${i.id}`}>{i.number}</Link></td>
                  <td className={tdCls}>{fmtDate(i.period_start)} – {fmtDate(i.period_end)}</td>
                  <td className={`${tdCls} ${i.is_overdue ? "font-medium text-red-600" : ""}`}>{fmtDate(i.due_date)}</td>
                  <td className={tdCls}><StatusBadge status={i.is_overdue ? "overdue" : i.status} /></td>
                  <td className={tdCls}>{fmtMoney(i.total)}</td>
                  <td className={tdCls}>{i.status === "confirmed" ? fmtMoney(i.amount_due) : "—"}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={invoices.count ?? 0} href={(p) => `${back}?page=${p}`} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Details">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Status</dt><dd><StatusBadge status={s.status} /></dd>
              <dt className="text-slate-500">Started</dt><dd>{fmtDate(s.start_date)}</dd>
              <dt className="text-slate-500">Ends</dt><dd>{fmtDate(s.expiry_date)}</dd>
              {s.status === "active" && <><dt className="text-slate-500">Next invoice</dt><dd>{fmtDate(s.next_invoice_date)}</dd></>}
              <dt className="text-slate-500">Payment terms</dt><dd>{s.payment_terms_days ? `${s.payment_terms_days} days` : "Immediate"}</dd>
            </dl>
            {(s.status === "active" || s.status === "paused") && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <PortalSubscriptionControls id={id} status={s.status} plan={s.plans} expiry={s.expiry_date} returnTo={back} />
                <p className="mt-3 text-xs text-slate-500">
                  {s.plans.pausable ? "You can pause this plan. " : "This plan can't be paused. "}
                  {s.plans.closable ? "You can cancel at any time." : "Contact us to cancel before the end date."}
                </p>
              </div>
            )}
          </Card>
          <Card title="History">
            <SubscriptionHistory events={(events.data ?? []) as SubscriptionEvent[]} createdAt={s.created_at} actorName={actorName} />
          </Card>
        </div>
      </div>
    </>
  );
}
