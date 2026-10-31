import { notFound } from "next/navigation";
import { Flash, type SearchParams } from "@/components/flash";
import { PlanForm } from "@/components/plan-form";
import { Card, PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: plan }, { count }] = await Promise.all([
    supabase.from("plans").select("*").eq("id", id).single(),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", id).eq("status", "active"),
  ]);
  if (!plan) notFound();
  return (
    <>
      <PageHeader title={plan.name} subtitle={`${count ?? 0} active subscription(s) on this plan`} />
      <Flash searchParams={searchParams} />
      <Card><PlanForm plan={plan} readOnly={profile?.role !== "admin"} /></Card>
    </>
  );
}
