import Link from "next/link";
import { saveTemplate } from "../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, Select, Table, Textarea, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const [{ data: templates, error }, { data: plans, error: plansError }] = await Promise.all([
    supabase.from("quotation_templates").select("id, name, validity_days, payment_terms_days, plans(name), quotation_template_lines(id)").order("name"),
    supabase.from("plans").select("id, name").eq("active", true).order("name"),
  ]);
  if (error || plansError) throw new Error((error || plansError)!.message);

  return (
    <>
      <PageHeader title="Quotation templates" subtitle="Reusable offers with the right plan and product lines" />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Template", "Plan", "Lines", "Valid for", "Payment terms"]} empty={!templates?.length}>
            {templates?.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/templates/${t.id}`}>{t.name}</Link></td>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <td className={tdCls}>{(t.plans as any)?.name ?? "—"}</td>
                <td className={tdCls}>{t.quotation_template_lines.length}</td>
                <td className={tdCls}>{t.validity_days} days</td>
                <td className={tdCls}>{t.payment_terms_days ? `${t.payment_terms_days} days` : "Immediate"}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="New template">
          <form action={saveTemplate.bind(null, null)} className="space-y-3">
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Plan">
              <Select name="plan_id" defaultValue="">
                <option value="">Choose…</option>
                {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valid for (days)"><Input name="validity_days" type="number" min="1" step="1" required defaultValue={30} /></Field>
              <Field label="Payment terms (days)"><Input name="payment_terms_days" type="number" min="0" step="1" required defaultValue={15} /></Field>
            </div>
            <Field label="Notes"><Textarea name="notes" /></Field>
            <Button type="submit" className="w-full">Create and add lines</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
