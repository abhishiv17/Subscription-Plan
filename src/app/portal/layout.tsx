import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("customer");
  const nav = [
    { href: "/portal", label: "My subscriptions" },
    { href: "/portal/invoices", label: "My invoices" },
    { href: "/portal/profile", label: "My profile" },
  ];
  return (
    <Shell profile={profile} nav={nav}>
      {children}
    </Shell>
  );
}
