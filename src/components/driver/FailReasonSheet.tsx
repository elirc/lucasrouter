'use client';

import { Ban, CircleQuestionMark, MapPinOff, PackageX } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui';
import { shortAddress } from '@/lib/geo';
import type { FailureReason, Stop } from '@/lib/types';

import { DriverDialog } from './DriverDialog';

export interface FailReasonSheetProps {
  open: boolean;
  /** The stop being marked failed (used for the subtitle). */
  stop: Stop | null;
  /** Reason + the optional free-text note typed above the reasons. */
  onPick: (reason: FailureReason, note?: string) => void;
  onClose: () => void;
}

/** All failure reasons, in display order (mirrors the `FailureReason` union). */
export const FAILURE_REASONS: readonly FailureReason[] = ['No one home', 'Wrong address', 'Damaged', 'Other'];

const REASON_ICON: Record<FailureReason, ReactNode> = {
  'No one home': <Ban className="size-5" aria-hidden="true" />,
  'Wrong address': <MapPinOff className="size-5" aria-hidden="true" />,
  Damaged: <PackageX className="size-5" aria-hidden="true" />,
  Other: <CircleQuestionMark className="size-5" aria-hidden="true" />,
};

/**
 * Small bottom sheet asking why a delivery failed. Picking a reason calls
 * `onPick` (the parent marks the stop failed and closes); Cancel/Escape/
 * backdrop just close.
 *
 * The reason buttons ARE the confirm — one tap, as before. The optional note
 * sits *above* them so anything typed is included in the record; a driver who
 * does not need it never touches it.
 */
export function FailReasonSheet({ open, stop, onPick, onClose }: FailReasonSheetProps) {
  return (
    <DriverDialog
      open={open}
      onClose={onClose}
      title="Why did it fail?"
      description={stop ? shortAddress(stop.address) : undefined}
    >
      {/* Keyed on the stop so the note never leaks to the next failed stop. */}
      {stop && <FailForm key={stop.id} onPick={onPick} onClose={onClose} />}
    </DriverDialog>
  );
}

function FailForm({ onPick, onClose }: Pick<FailReasonSheetProps, 'onPick' | 'onClose'>) {
  const [note, setNote] = useState('');
  return (
    <>
      <label className="block pb-3">
        <span className="text-sm font-medium text-slate-700">Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoComplete="off"
          placeholder="e.g. gate locked, no buzzer"
          className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        />
      </label>
      {/* No data-autofocus on a reason: focus lands on the dialog panel instead,
          so a held Enter (key auto-repeat) on "Failed" cannot record a failure
          before the driver has chosen why. */}
      <ul className="flex flex-col gap-2" aria-label="Failure reasons">
        {FAILURE_REASONS.map((reason) => (
          <li key={reason}>
            <button
              type="button"
              onClick={() => onPick(reason, note)}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-base font-medium text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                {REASON_ICON[reason]}
              </span>
              {reason}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="lg" fullWidth className="mt-3" onClick={onClose}>
        Cancel
      </Button>
    </>
  );
}
