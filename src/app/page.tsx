import { ArrowRight, LayoutDashboard, MapPinned, Route, Truck, Wand2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@/components/ui/Logo';

/**
 * Landing page (server component, no store): pick a role.
 * The dispatcher plans on desktop/tablet; drivers follow along on a phone.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-safe pb-safe md:px-8">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center pt-12 pb-8 text-center md:pt-20">
        <Logo withWordmark size={44} className="[&>span]:text-2xl" />
        <h1 className="mt-6 max-w-xl text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Delivery routes, planned in seconds.
        </h1>
        <p className="mt-3 max-w-lg text-base text-slate-600 md:text-lg">
          Smarter delivery routes for Madison, WI — optimize, dispatch, and follow every stop.
        </p>

        {/* Role cards */}
        <div className="mt-10 grid w-full gap-4 md:grid-cols-2">
          <RoleCard
            href="/dispatch"
            title="Open Dispatcher"
            blurb="Map all stops, run the optimizer, reassign on the fly."
            icon={<LayoutDashboard className="size-6" aria-hidden="true" />}
            accent="bg-blue-600"
          />
          <RoleCard
            href="/driver"
            title="Open Driver App"
            blurb="Follow your route stop by stop on your phone."
            icon={<Truck className="size-6" aria-hidden="true" />}
            accent="bg-emerald-600"
          />
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works" className="pb-10">
        <h2
          id="how-it-works"
          className="text-center text-xs font-semibold tracking-wide text-slate-500 uppercase"
        >
          How it works
        </h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          <Step
            n={1}
            icon={<MapPinned className="size-5" aria-hidden="true" />}
            title="Load the day's stops"
            text="45 mock deliveries across Madison and a 3-van fleet, ready to go."
          />
          <Step
            n={2}
            icon={<Wand2 className="size-5" aria-hidden="true" />}
            title="Optimize"
            text="Assign and sequence stops in one tap; see distance and time drop vs. the naive plan."
          />
          <Step
            n={3}
            icon={<Route className="size-5" aria-hidden="true" />}
            title="Dispatch & deliver"
            text="Drivers follow numbered stops with ETAs and mark each one delivered or failed."
          />
        </ol>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Demo — mock data, Madison WI. No accounts, no paid APIs.
      </footer>
    </main>
  );
}

function RoleCard({
  href,
  title,
  blurb,
  icon,
  accent,
}: {
  href: '/dispatch' | '/driver';
  title: string;
  blurb: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[44px] items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 active:translate-y-0 active:shadow-sm md:flex-col md:items-start md:p-6"
    >
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-white ${accent}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
          {title}
          <ArrowRight
            className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="mt-1 block text-sm text-slate-600">{blurb}</span>
      </span>
    </Link>
  );
}

function Step({ n, icon, title, text }: { n: number; icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">
          <span className="mr-1.5 text-slate-400 tabular-nums">{n}.</span>
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-slate-600">{text}</span>
      </span>
    </li>
  );
}
