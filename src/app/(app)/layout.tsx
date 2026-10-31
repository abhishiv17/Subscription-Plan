import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("admin", "staff");

  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/subscriptions", label: "Subscriptions" },
    { href: "/invoices", label: "Invoices" },
    { href: "/payments", label: "Payments" },
    { href: "/customers", label: "Customers" },
    { href: "/templates", label: "Quotation templates" },
    { href: "/products", label: "Products" },
    { href: "/plans", label: "Plans" },
    ...(profile.role === "admin"
      ? [
          { href: "/taxes", label: "Taxes" },
          { href: "/discounts", label: "Discounts" },
          { href: "/users", label: "Users" },
        ]
      : []),
  ];

  return (
    <Shell profile={profile} nav={nav}>
      {children}
    </Shell>
  );
}
