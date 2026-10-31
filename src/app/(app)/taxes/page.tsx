import { saveTax, toggleTax } from "../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TaxesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: taxes } = await supabase.from("taxes").select("*").order("rate", { ascending: false });

  return (
    <>
      <PageHeader title="Taxes" subtitle="Rules applied automatically to every invoice line" />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Name", "Rate", "Status", ""]} empty={!taxes?.length}>
            {taxes?.map((t) => (
              <tr key={t.id}>
                <td className={tdCls}>{t.name}</td>
                <td className={tdCls}>{Number(t.rate)}%</td>
                <td className={tdCls}><StatusBadge status={t.active ? "active" : "closed"} /></td>
                <td className={`${tdCls} text-right`}>
                  <form action={toggleTax.bind(null, t.id, !t.active)}>
                    <Button variant="ghost">{t.active ? "Deactivate" : "Activate"}</Button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="New tax rule">
          <form action={saveTax} className="space-y-3">
            <Field label="Name"><Input name="name" placeholder="GST 18%" required /></Field>
            <Field label="Rate (%)"><Input name="rate" type="number" step="0.01" min="0" max="100" required /></Field>
            <Button type="submit" className="w-full">Add tax</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
