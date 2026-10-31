import { notFound } from "next/navigation";
import { DiscountForm } from "@/components/discount-form";
import { Flash, type SearchParams } from "@/components/flash";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DiscountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const profile = await requireRole("admin", "staff");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: discount, error }, { data: products, error: productsError }] = await Promise.all([
    supabase.from("discounts").select("*, discount_products(product_id)").eq("id", id).single(),
    supabase.from("products").select("id, name").order("name"),
  ]);
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  if (productsError) throw new Error(productsError.message);
  if (!discount) notFound();
  return <><PageHeader title={discount.name} subtitle={`Used ${discount.used_count}${discount.usage_limit ? ` / ${discount.usage_limit}` : " times"}`} />
    <Flash searchParams={searchParams} /><Card title="Discount rule">
      <fieldset disabled={profile.role !== "admin"}><DiscountForm discount={discount} products={products ?? []} readOnly={profile.role !== "admin"} /></fieldset>
    </Card></>;
}
