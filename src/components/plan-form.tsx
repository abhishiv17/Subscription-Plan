import { savePlan } from "@/app/(app)/catalog-actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function PlanForm({ plan, readOnly }: { plan?: any; readOnly?: boolean }) {
  const flag = (name: string, label: string, hint: string, def: boolean) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={plan ? plan[name] : def} className="mt-1" />
      <span><span className="font-medium">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <form action={savePlan.bind(null, plan?.id ?? null)}>
      <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-2">
        <Field label="Plan name"><Input name="name" required defaultValue={plan?.name} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><Input name="price" type="number" step="0.01" min="0" required defaultValue={plan?.price} /></Field>
          <Field label="Bills every">
            <Select name="billing_period" defaultValue={plan?.billing_period ?? "monthly"}>
              <option value="daily">Day</option>
              <option value="weekly">Week</option>
              <option value="monthly">Month</option>
              <option value="yearly">Year</option>
            </Select>
          </Field>
        </div>
        <Field label="Minimum quantity"><Input name="min_quantity" type="number" min="1" defaultValue={plan?.min_quantity ?? 1} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Available from"><Input name="start_date" type="date" defaultValue={plan?.start_date ?? ""} /></Field>
          <Field label="Available until"><Input name="end_date" type="date" defaultValue={plan?.end_date ?? ""} /></Field>
        </div>
        <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2 md:col-span-2">
          {flag("auto_close", "Closes automatically", "Subscriptions close on their own when they end", false)}
          {flag("closable", "Can be closed early", "Allow closing before the end date", true)}
          {flag("pausable", "Can be paused", "Billing stops while paused", true)}
          {flag("renewable", "Can be renewed", "Extend for another period", true)}
          {plan && flag("active", "Active", "Offered for new subscriptions", true)}
        </div>
        <div className="md:col-span-2"><Field label="Notes"><Textarea name="notes" defaultValue={plan?.notes ?? ""} /></Field></div>
        {!readOnly && <div><Button type="submit">Save plan</Button></div>}
      </fieldset>
    </form>
  );
}
