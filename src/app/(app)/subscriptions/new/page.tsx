import { createSubscription } from "../actions";
import { Flash, type SearchParams } from "@/components/flash";
import { Button, Card, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";

export default async function NewSubscriptionPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const templateId = typeof sp.template === "string" ? sp.template : "";
  const customerId = typeof sp.customer === "string" ? sp.customer : "";
  const customerSearch = typeof sp.customerSearch === "string" ? sp.customerSearch.replace(/[^\p{L}\p{N}@._+ -]/gu, "").trim().slice(0, 100) : "";
  let customerQuery = supabase.from("customers").select("id, name, company, email").order("name").order("id").limit(50);
  if (customerSearch) customerQuery = customerQuery.or(`name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%,company.ilike.%${customerSearch}%`);
  const [customerResult, planResult, templateResult, discountResult, selectedResult] = await Promise.all([
    customerQuery,
    supabase.from("plans").select("id, name, price, billing_period").eq("active", true).order("name"),
    supabase.from("quotation_templates").select("id, name, validity_days").order("name"),
    supabase.from("discounts").select("id, name").eq("scope", "subscription").eq("active", true).order("name"),
    customerId ? supabase.from("customers").select("id, name, company, email").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [customerResult, planResult, templateResult, discountResult, selectedResult]) if (result.error) throw new Error(result.error.message);
  const customers = customerResult.data ?? [];
  const selectedCustomer = selectedResult.data;
  if (selectedCustomer && !customers.some(c => c.id === selectedCustomer.id)) customers.unshift(selectedCustomer);
  const plans = planResult.data, templates = templateResult.data, discounts = discountResult.data;


  return (
    <>
      <PageHeader title="New subscription" subtitle="Start from a quotation template to prefill the plan and product lines" />
      <Flash searchParams={searchParams} />
      <form action="/subscriptions/new" className="mb-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="template" value={templateId} />
        {customerId && <input type="hidden" name="customer" value={customerId} />}
        <Field label="Find customer" hint="Showing up to 50 matches; search to find any customer"><Input name="customerSearch" defaultValue={customerSearch} placeholder="Name, email or company" /></Field>
        <Button variant="secondary">Search customers</Button>
      </form>
      <Card>
        <form action={createSubscription} className="grid gap-4 md:grid-cols-2">
          <Field label="Customer">
            <Select name="customer_id" required defaultValue={typeof sp.customer === "string" ? sp.customer : ""}>
              <option value="">Choose a customer…</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email}){c.company ? ` (${c.company})` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quotation template" hint="Copies the template's plan, lines and payment terms in one save">
            <Select name="template_id" defaultValue={templateId}>
              <option value="">None, build from scratch</option>
              {templates?.map((t) => <option key={t.id} value={t.id}>{t.name} (valid {t.validity_days} days)</option>)}
            </Select>
          </Field>
          <Field label="Plan" hint="Leave empty to use the template's plan">
            <Select name="plan_id" defaultValue="">
              <option value="">From template</option>
              {plans?.map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtMoney(p.price)} / {p.billing_period})</option>)}
            </Select>
          </Field>
          <Field label="Discount (optional)">
            <Select name="discount_id" defaultValue="">
              <option value="">No discount</option>
              {discounts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Start date"><Input type="date" name="start_date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <Field label="Expiry date"><Input type="date" name="expiry_date" /></Field>
          <Field label="Payment terms (days)" hint="A selected template supplies its own payment terms"><Input type="number" min={0} name="payment_terms_days" defaultValue={15} /></Field>
          <div className="md:col-span-2"><Field label="Notes"><Textarea name="notes" /></Field></div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit">Create subscription</Button>
            <LinkButton variant="secondary" href="/subscriptions">Cancel</LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}
