import Link from "next/link";
import { type SearchParams } from "@/components/flash";
import { Button, Input, LinkButton, PageHeader, Pagination, Table, tdCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[,()%*]/g, "").trim() : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, email, company, phone, user_id", { count: "exact" })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) throw error;

  return (
    <>
      <PageHeader title="Customers" actions={<LinkButton href="/customers/new">New customer</LinkButton>} />
      <form className="mb-4 flex gap-2">
        <div className="w-72"><Input name="q" placeholder="Search name, email or company" defaultValue={q} /></div>
        <Button variant="secondary" type="submit">Search</Button>
      </form>
      <Table head={["Name", "Company", "Email", "Phone", "Portal"]} empty={!data?.length}>
        {data?.map((c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <td className={tdCls}><Link className="font-medium text-brand hover:underline" href={`/customers/${c.id}`}>{c.name}</Link></td>
            <td className={tdCls}>{c.company ?? "—"}</td>
            <td className={tdCls}>{c.email}</td>
            <td className={tdCls}>{c.phone ?? "—"}</td>
            <td className={tdCls}>{c.user_id ? "Yes" : "—"}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => `/customers?${new URLSearchParams({ q, page: String(p) })}`} />
    </>
  );
}
