import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoopMark } from "@/components/logo";
import { titleCase } from "@/lib/format";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_1px_rgb(34_26_36/0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/12 disabled:bg-slate-50 disabled:text-slate-500";

const btnBase =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors active:translate-y-px disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
const btnVariants = {
  primary: "bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(86_31_76/0.35)] hover:bg-brand-dark",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-[0_1px_1px_rgb(34_26_36/0.04)] hover:border-slate-400 hover:bg-slate-50",
  danger: "border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};
type Variant = keyof typeof btnVariants;
export const btnCls = (variant: Variant = "primary") => `${btnBase} ${btnVariants[variant]}`;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${btnCls(variant)} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${btnCls(variant)} ${className}`} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input className={inputCls} {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select className={`${inputCls} cursor-pointer`} {...props} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className={inputCls} rows={3} {...props} />;
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {(title || actions) && (
        <header className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={title || actions ? "px-5 pb-5 pt-3" : "p-5"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// [pill, dot]: colours follow the lifecycle, cool while a deal is forming, green once money flows.
const badgeColors: Record<string, [string, string]> = {
  draft: ["bg-slate-100 text-slate-700 ring-slate-200", "bg-slate-400"],
  quotation: ["bg-sky-50 text-sky-800 ring-sky-200", "bg-sky-500"],
  confirmed: ["bg-brand-light text-brand-dark ring-brand/20", "bg-brand"],
  active: ["bg-emerald-50 text-emerald-800 ring-emerald-200", "bg-emerald-500"],
  paused: ["bg-amber-50 text-amber-800 ring-amber-200", "bg-loop"],
  closed: ["bg-white text-slate-500 ring-slate-200", "bg-slate-300"],
  paid: ["bg-emerald-50 text-emerald-800 ring-emerald-200", "bg-emerald-500"],
  cancelled: ["bg-white text-slate-500 ring-slate-200 line-through decoration-slate-300", "bg-slate-300"],
  overdue: ["bg-red-50 text-red-700 ring-red-200", "bg-red-500"],
  admin: ["bg-brand-light text-brand-dark ring-brand/20", "bg-brand"],
  staff: ["bg-sky-50 text-sky-800 ring-sky-200", "bg-sky-500"],
  customer: ["bg-slate-100 text-slate-700 ring-slate-200", "bg-slate-400"],
};

/** Background class for a status's dot colour, for charts that need to match the badges. */
export const statusDot = (status: string) => (badgeColors[status] ?? badgeColors.draft)[1];

export function StatusBadge({ status }: { status: string }) {
  const [pill, dot] = badgeColors[status] ?? badgeColors.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-medium ring-1 ring-inset ${pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {titleCase(status)}
    </span>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/80">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-14 text-center">
                <LoopMark size={28} ring="var(--color-slate-200)" className="mx-auto mb-3 opacity-80" />
                <span className="text-sm text-slate-500">Nothing here yet.</span>
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export const tdCls = "px-4 py-3 align-middle text-slate-700";

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const [cls, dot] = {
    error: ["border-red-200 bg-red-50 text-red-800", "bg-red-500"],
    success: ["border-emerald-200 bg-emerald-50 text-emerald-900", "bg-emerald-500"],
    info: ["border-sky-200 bg-sky-50 text-sky-900", "bg-sky-500"],
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${cls}`}>
      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "danger" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className={`tabular mt-1.5 text-[26px] font-semibold leading-none tracking-tight ${tone === "danger" ? "text-red-700" : "text-slate-900"}`}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span className="tabular">
        {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString("en-IN")}
      </span>
      <div className="flex gap-2">
        {page > 1 && <LinkButton variant="secondary" href={href(page - 1)}>Previous</LinkButton>}
        {page < pages && <LinkButton variant="secondary" href={href(page + 1)}>Next</LinkButton>}
      </div>
    </div>
  );
}
