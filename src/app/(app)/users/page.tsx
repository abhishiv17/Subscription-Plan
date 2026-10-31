import { changeRole, inviteStaff } from "./actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Field, Input, PageHeader, Pagination, Select, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

const PAGE_SIZE = 25;
export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireRole("admin");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.replace(/[^\p{L}\p{N}@._+ -]/gu, "").trim().slice(0,100) : "";
  const role = typeof sp.role === "string" && ["admin", "staff", "customer"].includes(sp.role) ? sp.role : "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(sp.page) || 1)));
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, email, full_name, role, created_at", { count: "exact" }).order("created_at").order("id").range((page-1)*PAGE_SIZE, page*PAGE_SIZE-1);
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (role) query = query.eq("role", role);
  const { data: users, count, error } = await query;
  if (error) throw new Error(error.message);
  return <>
    <PageHeader title="Users" subtitle="Manage account roles and invite your team. Customers can also sign up themselves." />
    <Flash searchParams={searchParams} />
    <form className="mb-5 flex flex-wrap items-end gap-3">
      <Field label="Search accounts"><Input name="q" defaultValue={q} placeholder="Name or email" /></Field>
      <Field label="Role"><Select name="role" defaultValue={role}><option value="">All roles</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="customer">Customer</option></Select></Field>
      <Button variant="secondary">Search</Button>
    </form>
    <details className="mb-6 rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-brand">Invite team member</summary><div className="px-5 pb-5"><form action={inviteStaff} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label="Full name"><Input name="full_name" required /></Field><Field label="Email"><Input name="email" type="email" required /></Field>
      <Field label="Role"><Select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="admin">Admin</option></Select></Field>
      <p className="text-xs leading-5 text-slate-500 sm:col-span-2">They will receive an email to choose their own password. Staff manage day-to-day operations; admins also manage catalogue and account access.</p>
      <Button className="w-full">Send invitation</Button>
    </form></div></details>
        <div>
      <Table head={["Name", "Email", "Added", "Role"]} empty={!users?.length}>
        {users?.map(u => <tr key={u.id}><td className={tdCls}>{u.full_name || "-"}</td><td className={tdCls}>{u.email}</td><td className={tdCls}>{fmtDate(u.created_at)}</td><td className={tdCls}>
          {u.id === actor.id ? <span className="flex flex-wrap items-center gap-2"><StatusBadge status={u.role} /><span className="text-xs text-slate-500">Your account</span></span> : <form action={changeRole.bind(null,u.id)} className="flex gap-2"><Select style={{ minWidth: 112 }} name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`}><option value="customer">Customer</option><option value="staff">Staff</option><option value="admin">Admin</option></Select><Button variant="secondary">Save role</Button></form>}
        </td></tr>)}
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={p=>`/users?${new URLSearchParams({q,role,page:String(p)})}`} />
    </div>
  </>;
}
