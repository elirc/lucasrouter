'use client';

import { Building2, Camera, Check, DoorClosed, Trash2, UserCheck, Users } from 'lucide-react';
import { useState, type ChangeEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';
import type { DeliveryMethod, Stop } from '@/lib/types';
import type { DeliveryProofInput } from '@/store/useAppStore';

import { DriverDialog } from './DriverDialog';
import { makeThumbnail, storedPhotoBytes } from './photo';
import { DELIVERY_METHOD_LABELS } from './report';

export interface DeliverySheetProps {
  open: boolean;
  /** The stop being completed (subtitle + recipient prefill). */
  stop: Stop | null;
  onConfirm: (proof: DeliveryProofInput) => void;
  onClose: () => void;
}

/** Methods in display order; the first one is the default (most common). */
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ['handed', 'door', 'neighbour', 'desk'];

const METHOD_ICON: Record<DeliveryMethod, ReactNode> = {
  handed: <UserCheck className="size-5" aria-hidden="true" />,
  door: <DoorClosed className="size-5" aria-hidden="true" />,
  neighbour: <Users className="size-5" aria-hidden="true" />,
  desk: <Building2 className="size-5" aria-hidden="true" />,
};

/**
 * Proof-of-delivery sheet: how it was handed over, plus optional recipient
 * name / note / photo.
 *
 * SPEED IS THE FEATURE. A driver does this 40 times a day in the rain, so the
 * default method ("Handed to recipient") is pre-selected and the confirm is
 * the biggest thing on screen: the common path is **two taps** — Delivered,
 * then Confirm. Everything else is optional and never blocks that path.
 *
 * Deliberately NO `data-autofocus` (same reasoning as FailReasonSheet), which
 * `DriverDialog` reads as "focus the panel itself": nothing is focused that a
 * held Enter on the card's "Delivered" button could auto-activate by key repeat
 * — neither Confirm (a delivery recorded by accident) nor, as it did before the
 * dialog's fallback was fixed, the Close button (the sheet vanishing with
 * nothing recorded at all).
 *
 * The form is keyed on the stop id so every stop starts from a clean sheet.
 */
export function DeliverySheet({ open, stop, onConfirm, onClose }: DeliverySheetProps) {
  return (
    <DriverDialog
      open={open}
      onClose={onClose}
      title="Delivered"
      description={stop ? shortAddress(stop.address) : undefined}
    >
      {stop && <DeliveryForm key={stop.id} stop={stop} onConfirm={onConfirm} onClose={onClose} />}
    </DriverDialog>
  );
}

interface DeliveryFormProps {
  stop: Stop;
  onConfirm: (proof: DeliveryProofInput) => void;
  onClose: () => void;
}

function DeliveryForm({ stop, onConfirm, onClose }: DeliveryFormProps) {
  const [method, setMethod] = useState<DeliveryMethod>('handed');
  const [recipientName, setRecipientName] = useState(stop.recipient);
  /**
   * True once the driver has typed in "Received by". Until then the field is
   * only a prefill and the method may rewrite it; after that it is the driver's
   * answer and nothing touches it — clearing the name on purpose and then
   * switching method back used to re-insert the planned recipient, which is
   * exactly the name they had decided was wrong.
   */
  const [recipientTouched, setRecipientTouched] = useState(false);
  /**
   * Picking a method also keeps the "Received by" PREFILL honest: a parcel left
   * at the door has no recipient, so the planned name must not be stamped onto
   * it; coming back to a hand-over restores it.
   */
  const selectMethod = (m: DeliveryMethod) => {
    setMethod(m);
    if (recipientTouched) return;
    if (m === 'door') setRecipientName('');
    else if (m === 'handed') setRecipientName(stop.recipient);
  };
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const onPickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Let the same file be picked again after a removal (Chrome keeps `files`).
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    // Downscaled to <= 320 px / ~40 KB before it ever reaches the store —
    // localStorage cannot hold camera frames (see photo.ts).
    const thumb = await makeThumbnail(file);
    setPhotoBusy(false);
    if (thumb) setPhoto(thumb);
    else setPhotoError('Could not use that image — the delivery can still be saved.');
  };

  return (
    <div className="flex flex-col">
      <fieldset className="min-w-0">
        <legend className="pb-2 text-sm font-medium text-slate-700">How was it delivered?</legend>
        <div className="flex flex-col gap-2">
          {DELIVERY_METHODS.map((m) => (
            <label
              key={m}
              className={cn(
                'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-3 text-base transition-colors',
                'focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2',
                method === m
                  ? 'border-slate-900 bg-slate-900/5 font-semibold text-slate-900'
                  : 'border-slate-200 bg-white font-medium text-slate-800 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name="delivery-method"
                value={m}
                checked={method === m}
                onChange={() => selectMethod(m)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg',
                  method === m ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {method === m ? <Check className="size-5" strokeWidth={3} /> : METHOD_ICON[m]}
              </span>
              <span className="min-w-0 flex-1">{DELIVERY_METHOD_LABELS[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Optional detail. Kept visible (not behind a disclosure) but small:
          a driver who wants a name or a note should not have to hunt. */}
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Received by (optional)</span>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => {
              setRecipientTouched(true);
              setRecipientName(e.target.value);
            }}
            autoComplete="off"
            className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            placeholder={stop.recipient}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoComplete="off"
            className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            placeholder="e.g. left behind the planter"
          />
        </label>
      </div>

      {/* Photo: capture="environment" opens the rear camera straight away. */}
      <div className="mt-3 flex items-center gap-3">
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from
                the camera; next/image would try to optimize a client-side blob. */}
            <img
              src={photo}
              alt="Proof photo you just took"
              className="size-16 shrink-0 rounded-lg border border-slate-200 object-cover"
            />
            {/* Measured the way the store's PHOTO_BUDGET_BYTES measures it —
                the data URL's own character count, which is what the persisted
                blob carries — not the decoded image size (~1.34x smaller).
                Two different numbers for the same picture made "38 KB" here and
                "the photo budget is full" over there impossible to reconcile. */}
            <p className="min-w-0 flex-1 text-sm text-slate-600 tabular-nums">
              Photo attached · {Math.max(1, Math.round(storedPhotoBytes(photo) / 1024))} KB
            </p>
            <Button
              variant="ghost"
              onClick={() => setPhoto(null)}
              aria-label="Remove photo"
              icon={<Trash2 className="size-4" />}
              className="px-3!"
            >
              Remove
            </Button>
          </>
        ) : (
          <label
            className={cn(
              'flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900',
              'hover:bg-slate-50 focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2',
            )}
          >
            <Camera className="size-4 shrink-0" aria-hidden="true" />
            {photoBusy ? 'Adding photo…' : 'Add photo (optional)'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void onPickPhoto(e)}
            />
          </label>
        )}
      </div>
      {photoError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {photoError}
        </p>
      )}

      {/* Sticky so the primary action is reachable without scrolling the sheet
          on a short phone, whatever the driver typed above. */}
      <div className="sticky bottom-0 mt-4 flex flex-col gap-2 bg-white pt-2 pb-1">
        <Button
          size="lg"
          className="h-[52px]"
          fullWidth
          icon={<Check className="size-5" strokeWidth={2.5} />}
          onClick={() => onConfirm({ method, recipientName, note, photo: photo ?? undefined })}
        >
          Confirm delivery
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
