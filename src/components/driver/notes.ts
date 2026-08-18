import type { FailureReason } from '@/lib/types';

import { FAILURE_REASONS } from './FailReasonSheet';

export interface SplitNotes {
  /** Known failure reason found at the start of the notes, if any. */
  reason: FailureReason | null;
  /** The remaining free-text notes (seed delivery instructions), possibly ''. */
  note: string;
}

/**
 * The store records a failed attempt by prefixing the stop's notes with the
 * reason: `"<reason>"` or `"<reason> · <original notes>"`. Undo may leave that
 * prefix behind (older persisted data). Split it back out so the UI can show
 * the reason as "Last attempt: …" on failed stops and never present it as a
 * delivery instruction on pending/delivered ones.
 */
export function splitFailureNotes(notes: string | undefined): SplitNotes {
  const text = notes?.trim() ?? '';
  if (!text) return { reason: null, note: '' };
  for (const reason of FAILURE_REASONS) {
    if (text === reason) return { reason, note: '' };
    const prefix = `${reason} ·`;
    if (text.startsWith(prefix)) return { reason, note: text.slice(prefix.length).trim() };
  }
  return { reason: null, note: text };
}
