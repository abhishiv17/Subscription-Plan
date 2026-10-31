import { saveDiscount } from "@/app/(app)/catalog-actions";
import { Button, Field, Input, Select } from "@/components/ui";

type Discount = {
  id: string; name: string; code: string | null; discount_type: string; scope: string;
  value: number; min_purchase: number; min_quantity: number; start_date: string | null;
  end_date: string | null; usage_limit: number | null; active: boolean;
  discount_products: { product_id: string }[];
};
export function DiscountForm({ discount, products, readOnly }: { discount?: Discount; readOnly?: boolean; products: { id: string; name: string }[] }) {
  return (
          <form action={saveDiscount.bind(null, discount?.id ?? null)} className="space-y-3">
            <Field label="Name"><Input name="name" defaultValue={discount?.name} placeholder="Volume 10%" required /></Field>
            <Field label="Code (optional)"><Input name="code" defaultValue={discount?.code ?? ""} placeholder="VOLUME10" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select name="discount_type" defaultValue={discount?.discount_type ?? "percent"}>
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </Select>
              </Field>
              <Field label="Value"><Input name="value" defaultValue={discount?.value} type="number" step="0.01" min="0.01" required /></Field>
            </div>
            <Field label="Applies to">
              <Select name="scope" defaultValue={discount?.scope ?? "subscription"}>
                <option value="subscription">Whole subscriptions (attach to a subscription)</option>
                <option value="product">Specific products (applies automatically)</option>
              </Select>
            </Field>
            <Field label="Products" hint="For product discounts; hold Ctrl to pick several">
              <select name="product_ids" defaultValue={discount?.discount_products.map(p => p.product_id) ?? []} multiple className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" size={4}>
                {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min purchase"><Input name="min_purchase" type="number" step="0.01" min="0" defaultValue={discount?.min_purchase ?? 0} /></Field>
              <Field label="Min quantity"><Input name="min_quantity" type="number" step="0.01" min="0" defaultValue={discount?.min_quantity ?? 0} /></Field>
              <Field label="Starts"><Input name="start_date" type="date" defaultValue={discount?.start_date ?? ""} /></Field>
              <Field label="Ends"><Input name="end_date" type="date" defaultValue={discount?.end_date ?? ""} /></Field>
            </div>
            <Field label="Usage limit" hint="Leave empty for unlimited"><Input name="usage_limit" defaultValue={discount?.usage_limit ?? ""} type="number" min="1" /></Field>
            {discount && <label className="flex gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={discount.active} />Active</label>}
            {!readOnly && <Button type="submit" className="w-full">Save discount</Button>}
          </form>
  );
}
