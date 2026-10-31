import { CustomerForm } from "@/components/customer-form";
import { Flash, type SearchParams } from "@/components/flash";
import { Card, PageHeader } from "@/components/ui";

export default function NewCustomerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="New customer" />
      <Flash searchParams={searchParams} />
      <Card><CustomerForm /></Card>
    </>
  );
}
