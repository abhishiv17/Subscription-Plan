import { saveTax, toggleTax } from "../catalog-actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TaxesPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireRole("admin", "staff");
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();
  const { data: taxes, error } = await supabase.from("taxes").select("*").order("rate", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Taxes" subtitle="Rules applied automatically to every invoice line" />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
          <Table head={["Name", "Rate", "Status", ""]} empty={!taxes?.length}>
            {taxes?.map((t) => (
              <tr key={t.id}>
                <td className={tdCls}>{t.name}</td>
                <td className={tdCls}>{Number(t.rate)}%</td>
                <td className={tdCls}><StatusBadge status={t.active ? "active" : "closed"} /></td>
                <td className={`${tdCls} text-right`}>
                  {isAdmin && <details className="mb-2"><summary className="cursor-pointer text-brand">Edit</summary><form action={saveTax.bind(null, t.id)} className="mt-2 space-y-2">
                    <Field label="Name"><Input name="name" defaultValue={t.name} required /></Field>
                    <Field label="Rate (%)"><Input name="rate" type="number" min="0" max="100" step="0.01" defaultValue={t.rate} required /></Field>
                    <Button>Save tax</Button>
                  </form></details>}
                  {isAdmin && <form action={toggleTax.bind(null, t.id, !t.active)}>
                    <Button variant="ghost">{t.active ? "Deactivate" : "Activate"}</Button>
                  </form>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
        {isAdmin && <Card title="New tax rule">
          <form action={saveTax.bind(null, null)} className="space-y-3">
            <Field label="Name"><Input name="name" placeholder="GST 18%" required /></Field>
            <Field label="Rate (%)"><Input name="rate" type="number" step="0.01" min="0" max="100" required /></Field>
            <Button type="submit" className="w-full">Add tax</Button>
          </form>
        </Card>}
      </div>
    </>
  );
}
