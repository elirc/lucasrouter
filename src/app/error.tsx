'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Logo } from '@/components/ui/Logo';

/**
 * App-wide error boundary (Next `error.tsx`): a rendering / runtime error in a
 * screen shows this instead of a blank page. `reset()` re-renders the segment;
 * the links get the user somewhere useful when that does not help.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[RouteIQ] screen crashed', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 pt-safe pb-safe text-center">
      <Logo withWordmark size={36} />
      <div
        className="mt-8 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-700"
        aria-hidden="true"
      >
        <TriangleAlert className="size-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        This screen hit an unexpected error. Your delivery progress is saved on this device.
      </p>
      {error.digest && <p className="mt-1 text-xs text-slate-400 tabular-nums">Ref {error.digest}</p>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
