import { ArrowLeft, Compass } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/ui/Logo';

/** App-wide 404 (unknown routes, unknown driver ids). Server component, no store. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 pt-safe pb-safe text-center">
      <Logo withWordmark size={36} />
      <div
        className="mt-8 flex size-14 items-center justify-center rounded-full bg-slate-200 text-slate-600"
        aria-hidden="true"
      >
        <Compass className="size-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        That address is not on today&apos;s route. Head back to the start.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Home
        </Link>
        <Link
          href="/driver"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Driver app
        </Link>
      </div>
    </main>
  );
}
