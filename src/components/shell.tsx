import type { ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Wordmark } from "@/components/logo";
import { Nav, type NavItem } from "@/components/nav";
import { titleCase } from "@/lib/format";
import type { Profile } from "@/lib/auth";

function initials(profile: Profile) {
  const name = profile.full_name?.trim() || profile.email;
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Shell({ profile, nav, children }: { profile: Profile; nav: NavItem[]; children: ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print flex flex-col md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
        <div className="px-5 pb-3 pt-5 md:pb-6">
          <Wordmark />
        </div>
        <div className="px-3 pb-3 md:flex-1 md:overflow-y-auto">
          <Nav items={nav} />
        </div>
        <div className="hidden items-center gap-3 border-t border-slate-300/60 px-5 py-4 md:flex">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {initials(profile)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{profile.full_name ?? profile.email}</div>
            <div className="text-xs text-slate-500">{titleCase(profile.role)}</div>
          </div>
          <form action={signOut}>
            <button className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white/70 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="print-flat min-w-0 flex-1 border-slate-200 bg-white px-4 py-6 md:my-2 md:mr-2 md:rounded-2xl md:border md:px-10 md:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
        <form action={signOut} className="no-print mt-10 border-t border-slate-100 pt-4 md:hidden">
          <button className="text-sm text-slate-500">Sign out of {profile.email}</button>
        </form>
      </main>
    </div>
  );
}
