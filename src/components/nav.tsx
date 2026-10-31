"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

// 24px stroke icons, keyed by the last segment of the nav href.
const icons: Record<string, string> = {
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  subscriptions: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  invoices: "M6 3h9l3 3v15l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5zM9 9h6M9 13h6M9 17h3",
  payments: "M3 7h18v11H3zM3 11h18M7 15h3",
  customers: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  templates: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  products: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  plans: "M4 6h16M4 12h16M4 18h10",
  taxes: "M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  discounts: "M3 12V4h8l10 10-8 8zM8 8.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  users: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  portal: "M12 3l8 6v12H4V9zM9 21v-6h6v6",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
};

function NavIcon({ href }: { href: string }) {
  const d = icons[href.split("/").filter(Boolean).pop() ?? ""];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // The longest matching href wins, so /portal isn't also lit up on /portal/invoices.
  const current = items
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-white font-semibold text-brand shadow-[0_1px_2px_rgb(34_26_36/0.08)] ring-1 ring-slate-200"
                : "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            <NavIcon href={item.href} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
