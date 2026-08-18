'use client';

import { Ban, CircleQuestionMark, MapPinOff, PackageX } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui';
import { shortAddress } from '@/lib/geo';
import type { FailureReason, Stop } from '@/lib/types';

import { DriverDialog } from './DriverDialog';

export interface FailReasonSheetProps {
  open: boolean;
  /** The stop being marked failed (used for the subtitle). */
  stop: Stop | null;
  onPick: (reason: FailureReason) => void;
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
 */
export function FailReasonSheet({ open, stop, onPick, onClose }: FailReasonSheetProps) {
  return (
    <DriverDialog
      open={open}
      onClose={onClose}
      title="Why did it fail?"
      description={stop ? shortAddress(stop.address) : undefined}
    >
      <ul className="flex flex-col gap-2" aria-label="Failure reasons">
        {FAILURE_REASONS.map((reason, i) => (
          <li key={reason}>
            <button
              type="button"
              data-autofocus={i === 0 ? 'true' : undefined}
              onClick={() => onPick(reason)}
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
    </DriverDialog>
  );
}
