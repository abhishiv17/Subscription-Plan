import { saveCustomer } from "@/app/(app)/customers/actions";
import { Button, Field, Input, Textarea } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CustomerForm({ customer }: { customer?: any }) {
  return (
    <form action={saveCustomer.bind(null, customer?.id ?? null)} className="grid gap-4 md:grid-cols-2">
      <Field label="Name"><Input name="name" required defaultValue={customer?.name} /></Field>
      <Field label="Email"><Input name="email" type="email" required defaultValue={customer?.email} /></Field>
      <Field label="Company"><Input name="company" defaultValue={customer?.company ?? ""} /></Field>
      <Field label="Phone"><Input name="phone" defaultValue={customer?.phone ?? ""} /></Field>
      <div className="md:col-span-2"><Field label="Address"><Textarea name="address" defaultValue={customer?.address ?? ""} /></Field></div>
      <div className="md:col-span-2"><Button type="submit">Save customer</Button></div>
    </form>
  );
}
