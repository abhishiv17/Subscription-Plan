import Link from "next/link";
import { Wordmark, LoopMark } from "@/components/logo";
import { LinkButton } from "@/components/ui";
import { getProfile, homeFor } from "@/lib/auth";

const goals = [
  ["One place for the whole cycle", "Bring products, plans, quotations, subscriptions and invoices together so your team always knows what comes next."],
  ["Keep recurring work moving", "Manage billing periods, taxes and discounts, then run billing when it is time to invoice. Track payments and see what is outstanding."],
  ["Give customers clarity", "Let customers see their own subscriptions and invoices, with pause, renewal and payment options based on their plan."],
];
const audiences = [
  ["Business owners", "Get a clear view of recurring revenue, active subscriptions and unpaid invoices."],
  ["Operations & finance teams", "Move from quotation to subscription to payment with a shared view of every customer."],
  ["Your customers", "A dedicated portal to check their plans, follow invoices and manage their subscription."],
];

export default async function Home() {
  const profile = await getProfile();
  const destination = profile ? homeFor(profile.role) : "/login";
  const actionLabel = profile ? (profile.role === "customer" ? "Open my portal" : "Open dashboard") : "Log in";
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" aria-label="Brightloop home"><Wordmark /></Link>
          <div className="flex items-center gap-5"><a href="#who-it-helps" className="hidden text-sm text-slate-600 hover:text-brand sm:block">Who it helps</a><LinkButton href={destination}>{actionLabel} <span aria-hidden>&#8599;</span></LinkButton></div>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-brand">A clearer cycle. Every month.</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Less subscription admin.<br /><span className="text-brand">More room to grow.</span></h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600">Brightloop helps businesses manage recurring services, from the first quotation to the next renewal. Keep your team, billing and customers on the same page.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={profile ? destination : "/signup"} className="h-12 px-6">{profile ? actionLabel : "Create an account"} <span aria-hidden>&#8594;</span></LinkButton>
              <LinkButton href={profile ? "#goals" : "/login"} variant="secondary" className="h-12 px-6">{profile ? "Explore Brightloop" : "Already a member? Log in"}</LinkButton>
            </div>
            <p className="mt-4 text-xs text-slate-500">{profile ? `Welcome back${profile.full_name ? `, ${profile.full_name}` : ""}. Your workspace is ready.` : "Customer signup is open. Team access is managed by your administrator."}</p>
          </div>
          <div className="relative overflow-hidden rounded-3xl bg-brand-deep p-7 text-white sm:p-10">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[36px] border-white/5" aria-hidden />
            <div className="relative"><LoopMark size={44} ring="#fff" /><p className="mt-8 text-xs uppercase tracking-[0.2em] text-white/60">From first hello to next renewal</p><h2 className="mt-3 text-3xl font-medium tracking-tight">Every step, connected.</h2>
              <ol className="mt-8">
                {[["Set up", "Products, pricing and plans"], ["Subscribe", "Quotations and customer subscriptions"], ["Bill & collect", "Invoices, taxes and payment tracking"], ["Keep the loop going", "Pauses, renewals and a customer portal"]].map(([title, text], i) => <li key={title} className="flex gap-4 pb-6 last:pb-0"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-loop/60 text-sm text-loop">{i + 1}</span><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-white/65">{text}</p></div></li>)}
              </ol>
            </div>
          </div>
        </section>
        <section id="goals" className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Our goal</p><h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Make recurring business feel manageable.</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">{goals.map(([title, text], i) => <article key={title}><span className="text-sm font-semibold text-brand">0{i + 1} /</span><h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{text}</p></article>)}</div>
          </div>
        </section>
        <section id="who-it-helps" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4"><h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Built for both sides of the subscription.</h2><p className="max-w-sm text-sm leading-6 text-slate-600">For service providers, software businesses and teams managing ongoing customer relationships.</p></div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">{audiences.map(([title, text]) => <article key={title} className="rounded-2xl border border-slate-200 p-7"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{text}</p></article>)}</div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-brand-light p-8"><div><h2 className="text-2xl font-semibold tracking-tight">Ready for your next cycle?</h2><p className="mt-2 text-sm text-slate-600">{profile ? "Pick up where you left off." : "Create your customer account, or log in to your existing workspace."}</p></div><LinkButton href={profile ? destination : "/signup"} className="h-11 px-5">{profile ? actionLabel : "Get started"} <span aria-hidden>&#8594;</span></LinkButton></div>
        </section>
      </main>
      <footer className="border-t border-slate-200"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-7"><Wordmark /><p className="text-xs text-slate-500">Plans. People. Payments. One continuous loop.</p><Link href={destination} className="text-sm font-medium text-brand">{actionLabel}</Link></div></footer>
    </div>
  );
}
