import { portalRenew, portalSetStatus } from "./actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function PortalPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  // RLS limits these rows to the signed-in customer's own subscriptions.
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, number, status, quotation_valid_until, start_date, expiry_date, next_invoice_date, plans(name, billing_period, pausable, closable, renewable), subscription_lines(id, quantity, unit_price, amount, products(name), product_variants(value))")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="My subscriptions" subtitle="See and manage everything you subscribe to" />
      <Flash searchParams={searchParams} />
      {!subs?.length && (
        <Card><p className="text-sm text-slate-500">You don&apos;t have any subscriptions yet. Our team will set one up for you after your first order.</p></Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {subs?.map((s: any) => {
          const total = s.subscription_lines.reduce((sum: number, l: any) => sum + Number(l.amount), 0);
          const live = s.status === "active" || s.status === "paused";
          return (
            <Card
              key={s.id}
              title={<span className="flex items-center gap-2">{s.number} <StatusBadge status={s.status} /></span>}
            >
              <div className="text-sm text-slate-600">
                {s.plans.name} · billed {s.plans.billing_period}
              </div>
              <ul className="my-3 divide-y divide-slate-100 text-sm">
                {s.subscription_lines.map((l: any) => (
                  <li key={l.id} className="flex justify-between py-1.5">
                    <span>{l.products.name}{l.product_variants ? ` (${l.product_variants.value})` : ""} × {Number(l.quantity)}</span>
                    <span>{fmtMoney(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm font-semibold"><span>Per period (before tax)</span><span>{fmtMoney(total)}</span></div>
              <div className="mt-2 text-xs text-slate-500">
                Started {fmtDate(s.start_date)} · ends {fmtDate(s.expiry_date)}
                {s.status === "active" && <> · next invoice {fmtDate(s.next_invoice_date)}</>}
              </div>
              {s.quotation_valid_until && s.status !== "draft" && <div className="mt-4"><LinkButton variant="secondary" href={`/quotations/${s.id}`}>View quotation</LinkButton></div>}
              {live && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {s.status === "active" && s.plans.pausable && (
                    <form action={portalSetStatus.bind(null, s.id, "paused")}><Button variant="secondary">Pause</Button></form>
                  )}
                  {s.status === "paused" && <form action={portalSetStatus.bind(null, s.id, "active")}><Button>Resume</Button></form>}
                  {s.plans.renewable && <form action={portalRenew.bind(null, s.id)}><Button variant="secondary">Renew</Button></form>}
                  {s.plans.closable && <form action={portalSetStatus.bind(null, s.id, "closed")}><Button variant="danger">Cancel subscription</Button></form>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
