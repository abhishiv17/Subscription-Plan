import Link from "next/link";
import { Flash, type SearchParams } from "@/components/flash";
import { PortalSubscriptionControls } from "@/components/portal-subscription-controls";
import { Card, LinkButton, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function PortalPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  // RLS limits these rows to the signed-in customer's own records. Drafts are internal, so they stay hidden.
  const [{ data: subs, error }, { data: due, error: dueError }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, number, status, quotation_valid_until, start_date, expiry_date, next_invoice_date, plans(name, billing_period, pausable, closable, renewable), subscription_lines(id, quantity, amount, description, products(name), product_variants(value))")
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase.from("invoice_overview").select("id, amount_due, is_overdue").eq("status", "confirmed"),
  ]);
  if (error || dueError) throw new Error((error ?? dueError)!.message);
  const outstanding = (due ?? []).reduce((sum, i) => sum + Number(i.amount_due), 0);
  const overdue = (due ?? []).filter((i) => i.is_overdue).length;
  const live = (subs ?? []).filter((s: any) => s.status === "active" || s.status === "paused").length;

  return (
    <>
      <PageHeader title="My subscriptions" subtitle="See and manage everything you subscribe to" />
      <Flash searchParams={searchParams} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Active or paused" value={live} />
        <Stat label="Amount to pay" value={fmtMoney(outstanding)} hint={due?.length ? <Link className="text-brand hover:underline" href="/portal/invoices?filter=outstanding">{due.length} open invoice{due.length === 1 ? "" : "s"}</Link> : "Nothing to pay"} />
        <Stat label="Overdue invoices" value={overdue} tone={overdue ? "danger" : "default"} hint={overdue ? <Link className="hover:underline" href="/portal/invoices?filter=overdue">Pay now to avoid interruption</Link> : undefined} />
      </div>
      {!subs?.length && (
        <Card><p className="text-sm text-slate-500">You don&apos;t have any subscriptions yet. Our team will set one up for you after your first order.</p></Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {subs?.map((s: any) => {
          const total = s.subscription_lines.reduce((sum: number, l: any) => sum + Number(l.amount), 0);
          return (
            <Card
              key={s.id}
              title={<Link href={`/portal/subscriptions/${s.id}`} className="flex items-center gap-2 hover:text-brand">{s.number} <StatusBadge status={s.status} /></Link>}
              actions={<Link className="text-sm font-medium text-brand hover:underline" href={`/portal/subscriptions/${s.id}`}>Details</Link>}
            >
              <div className="text-sm text-slate-600">
                {s.plans.name} · billed {s.plans.billing_period}
              </div>
              <ul className="my-3 divide-y divide-slate-100 text-sm">
                {s.subscription_lines.map((l: any) => (
                  <li key={l.id} className="flex justify-between gap-3 py-1.5">
                    <span>{l.description || l.products.name}{l.product_variants ? ` (${l.product_variants.value})` : ""} × {Number(l.quantity)}</span>
                    <span className="tabular">{fmtMoney(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm font-semibold"><span>Per period (before tax)</span><span className="tabular">{fmtMoney(total)}</span></div>
              <div className="mt-2 text-xs text-slate-500">
                Started {fmtDate(s.start_date)} · ends {fmtDate(s.expiry_date)}
                {s.status === "active" && <> · next invoice {fmtDate(s.next_invoice_date)}</>}
              </div>
              {s.quotation_valid_until && (
                <div className="mt-4"><LinkButton variant="secondary" href={`/quotations/${s.id}`}>View quotation</LinkButton></div>
              )}
              {(s.status === "active" || s.status === "paused") && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <PortalSubscriptionControls id={s.id} status={s.status} plan={s.plans} expiry={s.expiry_date} returnTo="/portal" />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
