import { createStaff } from "./actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, Select, StatusBadge, Table, tdCls } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .in("role", ["admin", "staff"])
    .order("created_at");

  return (
    <>
      <PageHeader title="Users" subtitle="Internal team. Customers sign up themselves through the portal." />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table head={["Name", "Email", "Role", "Added"]} empty={!users?.length}>
            {users?.map((u) => (
              <tr key={u.id}>
                <td className={tdCls}>{u.full_name}</td>
                <td className={tdCls}>{u.email}</td>
                <td className={tdCls}><StatusBadge status={u.role} /></td>
                <td className={tdCls}>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Add staff member">
          <form action={createStaff} className="space-y-3">
            <Field label="Full name"><Input name="full_name" required /></Field>
            <Field label="Email"><Input name="email" type="email" required /></Field>
            <Field label="Temporary password" hint="More than 8 characters, with upper, lower and special characters">
              <Input name="password" type="password" required />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="staff">
                <option value="staff">Staff (day-to-day, limited access)</option>
                <option value="admin">Admin (full control)</option>
              </Select>
            </Field>
            <Button type="submit" className="w-full">Create user</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
