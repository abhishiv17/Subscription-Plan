import { portalUpdateProfile } from "../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PortalProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, company, address")
    .eq("user_id", profile!.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="My profile" subtitle="The details we put on your invoices" />
      <Flash searchParams={searchParams} />
      {!customer ? (
        <Card><p className="text-sm text-slate-500">No billing profile is linked to this account yet. Please contact our team.</p></Card>
      ) : (
        <Card className="max-w-2xl">
          <form action={portalUpdateProfile} className="grid gap-4 md:grid-cols-2">
            <Field label="Name"><Input name="name" required maxLength={120} defaultValue={customer.name} autoComplete="name" /></Field>
            <Field label="Billing email" hint="Contact us to change the email on your invoices.">
              <Input name="email_display" type="email" value={customer.email} disabled readOnly />
            </Field>
            <Field label="Phone"><Input name="phone" type="tel" maxLength={25} pattern={"\\+?[0-9][0-9 \\(\\)\\-]{5,24}"} title="Digits, spaces, brackets and dashes, optionally starting with +" defaultValue={customer.phone ?? ""} autoComplete="tel" /></Field>
            <Field label="Company"><Input name="company" maxLength={120} defaultValue={customer.company ?? ""} autoComplete="organization" /></Field>
            <div className="md:col-span-2">
              <Field label="Billing address"><Textarea name="address" maxLength={500} defaultValue={customer.address ?? ""} autoComplete="street-address" /></Field>
            </div>
            <div className="md:col-span-2"><Button type="submit">Save profile</Button></div>
          </form>
        </Card>
      )}
    </>
  );
}
