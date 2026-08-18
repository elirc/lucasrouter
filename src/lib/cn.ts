// Tiny className joiner (no clsx dependency). Accepts strings, falsy values,
// arrays and { className: boolean } records so components can express
// conditional classes concisely:
//
//   cn('px-4', isActive && 'bg-slate-900', { 'opacity-50': disabled })
//
// Note: this does NOT de-duplicate conflicting Tailwind utilities (no
// tailwind-merge). Components put caller `className` LAST so later classes
// win in the common cases where Tailwind's cascade order allows it.

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input && input !== 0) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else if (typeof input === 'object') {
      for (const [key, on] of Object.entries(input)) {
        if (on) out.push(key);
      }
    }
  }
  return out.join(' ');
}
