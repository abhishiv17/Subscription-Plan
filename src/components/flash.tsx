import { Alert } from "@/components/ui";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function Flash({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (typeof sp.ok === "string") return <div className="mb-4"><Alert kind="success">{sp.ok}</Alert></div>;
  if (typeof sp.err === "string") return <div className="mb-4"><Alert>{sp.err}</Alert></div>;
  return null;
}
