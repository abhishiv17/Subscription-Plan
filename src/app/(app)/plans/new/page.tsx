import { Flash, type SearchParams } from "@/components/flash";
import { PlanForm } from "@/components/plan-form";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function NewPlanPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  return (
    <>
      <PageHeader title="New plan" />
      <Flash searchParams={searchParams} />
      <Card><PlanForm /></Card>
    </>
  );
}
