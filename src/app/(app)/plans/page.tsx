import Link from "next/link";
import { Flash, type SearchParams } from "@/components/flash";
import { LinkButton, PageHeader, StatusBadge, Table, tdCls } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function PlansPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: plans } = await supabase.from("plans").select("*").order("name");
  const rules = (p: Record<string, boolean>) =>
    [p.auto_close && "auto-close", p.closable && "close early", p.pausable && "pause", p.renewable && "renew"].filter(Boolean).join(" · ") || "—";

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Pricing, billing frequency and lifecycle rules"
        actions={profile?.role === "admin" && <LinkButton href="/plans/new">New plan</LinkButton>}
      />
      <Flash searchParams={searchParams} />
      <Table head={["Plan", "Price", "Bills", "Min qty", "Available", "Allows", "Status"]} empty={!plans?.length}>
        {plans?.map((p) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/plans/${p.id}`}>{p.name}</Link></td>
            <td className={tdCls}>{fmtMoney(p.price)}</td>
            <td className={tdCls}>{p.billing_period}</td>
            <td className={tdCls}>{p.min_quantity}</td>
            <td className={tdCls}>{p.start_date || p.end_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}` : "Always"}</td>
            <td className={`${tdCls} text-xs`}>{rules(p)}</td>
            <td className={tdCls}><StatusBadge status={p.active ? "active" : "closed"} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
