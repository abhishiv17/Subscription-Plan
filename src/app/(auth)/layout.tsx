import { Wordmark } from "@/components/logo";

// The subscription lifecycle, placed clockwise around the loop (r = 140 around 200,200).
const stages = [
  { label: "Quotation", node: [200, 60], text: [200, 34], anchor: "middle" },
  { label: "Confirmed", node: [333.1, 156.7], text: [358, 152], anchor: "start" },
  { label: "Active", node: [282.3, 313.3], text: [298, 340], anchor: "start" },
  { label: "Invoiced", node: [117.7, 313.3], text: [102, 340], anchor: "end" },
  { label: "Paid", node: [66.9, 156.7], text: [42, 152], anchor: "end" },
] as const;

function LifecycleLoop() {
  return (
    <svg viewBox="-70 0 540 400" className="w-full max-w-[440px]" role="img" aria-label="Quotation, confirmed, active, invoiced, paid, then renewed">
      <circle cx="200" cy="200" r="140" stroke="rgb(255 255 255 / 0.12)" strokeWidth="2" fill="none" />
      <path
        d="M200 60 A140 140 0 1 1 66.9 156.7"
        stroke="var(--color-loop)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        className="loop-draw"
        style={{ "--loop-length": 704 } as React.CSSProperties}
      />
      <path d="M66.9 156.7 A140 140 0 0 1 200 60" stroke="rgb(255 255 255 / 0.35)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <text x="200" y="196" textAnchor="middle" fill="rgb(255 255 255 / 0.5)" fontSize="13">renews on</text>
      <text x="200" y="218" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="600">
        schedule
      </text>
      {stages.map((s) => (
        <g key={s.label}>
          <circle cx={s.node[0]} cy={s.node[1]} r="6" fill="var(--color-brand-deep)" stroke="#fff" strokeWidth="2" />
          <text x={s.text[0]} y={s.text[1]} textAnchor={s.anchor} fill="rgb(255 255 255 / 0.78)" fontSize="14" fontWeight="500">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-deep p-12 text-white lg:flex">
        <Wordmark light />
        <div className="flex justify-center py-8">
          <LifecycleLoop />
        </div>
        <div className="max-w-md">
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.02em]">Quote it, bill it, get paid, then go round again.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/65">
            Brightloop takes each subscription from first quotation to paid invoice, and bills it again every period without anyone chasing it.
          </p>
        </div>
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Wordmark />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm [&>h2]:mb-6 [&>h2]:text-[26px] [&>h2]:font-bold [&>h2]:tracking-[-0.02em] [&>h2]:text-slate-900">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
