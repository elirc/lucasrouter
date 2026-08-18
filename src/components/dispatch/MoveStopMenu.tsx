'use client';

import { ArrowDownToLine, ArrowUpToLine, MoreHorizontal } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/geo';
import type { Driver, Stop } from '@/lib/types';

export interface MoveStopMenuProps {
  stop: Stop;
  drivers: Driver[];
  /** Driver the stop currently belongs to; `null` when unassigned. */
  currentDriverId: string | null;
  /** 0-based position within the current route (ignored when unassigned). */
  index?: number;
  /** Length of the current route (ignored when unassigned). */
  routeLength?: number;
  /** Disables the trigger (e.g. while the optimizer is running). */
  disabled?: boolean;
  /**
   * Called with the target driver and optional insertion index — the same
   * shape as `moveStop(stopId, toDriverId, index?)`; `index` omitted = append.
   */
  onMove: (toDriverId: string, index?: number) => void;
  className?: string;
}

type MenuState = 'closed' | 'open' | 'closed-restore';

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

/** Fixed row height (min-h-11) used to estimate the popover height before it mounts. */
const ITEM_HEIGHT = 44;
/** Vertical padding of the popover (py-1). */
const MENU_PADDING_Y = 8;
/** Separator: 1px line + my-1 margins. */
const SEPARATOR_HEIGHT = 9;
const MENU_WIDTH = 240;
const VIEWPORT_GUTTER = 8;
const TRIGGER_GAP = 4;

/**
 * "⋯" trigger + popover menu for moving a stop between drivers (and to the
 * top/end of its own route). The popover is portaled to `document.body` and
 * positioned `fixed` next to the trigger, so it is never clipped by the
 * scrolling panel / bottom sheet and always sits above them (z-50).
 *
 * Accessibility: `aria-haspopup="menu"` trigger, `role="menu"` container with
 * `role="menuitem"` buttons, roving focus with Arrow/Home/End keys, Escape or
 * outside click closes and focus returns to the trigger.
 */
export function MoveStopMenu({
  stop,
  drivers,
  currentDriverId,
  index,
  routeLength,
  disabled = false,
  onMove,
  className,
}: MoveStopMenuProps) {
  // 'closed-restore' is "closed, and hand focus back to the trigger" — kept as
  // a state value (not a ref) so the focus effect can react to the transition.
  const [menuState, setMenuState] = useState<MenuState>('closed');
  const open = menuState === 'open';
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const address = shortAddress(stop.address);
  const currentDriver = currentDriverId ? drivers.find((d) => d.id === currentDriverId) : undefined;
  const isAssigned = !!currentDriver;

  const close = useCallback((restoreFocus: boolean) => {
    setMenuState(restoreFocus ? 'closed-restore' : 'closed');
  }, []);

  const select = (fn: () => void) => {
    close(true);
    fn();
  };

  // ---- items ---------------------------------------------------------------
  const ownRouteItems: MenuItem[] = currentDriver
    ? [
        {
          key: 'top',
          label: 'Move to top',
          icon: <ArrowUpToLine className="size-4" aria-hidden="true" />,
          disabled: index === 0,
          onSelect: () => select(() => onMove(currentDriver.id, 0)),
        },
        {
          key: 'end',
          label: 'Move to end',
          icon: <ArrowDownToLine className="size-4" aria-hidden="true" />,
          disabled: routeLength !== undefined && index === routeLength - 1,
          onSelect: () => select(() => onMove(currentDriver.id)),
        },
      ]
    : [];

  const driverItems: MenuItem[] = drivers
    .filter((d) => d.id !== currentDriverId)
    .map((d) => ({
      key: d.id,
      label: `${isAssigned ? 'Move' : 'Assign'} to ${d.name}`,
      icon: (
        <span
          aria-hidden="true"
          className="block size-3 shrink-0 rounded-full ring-2 ring-white"
          style={{ backgroundColor: d.color, boxShadow: '0 0 0 1px rgb(15 23 42 / 0.15)' }}
        />
      ),
      onSelect: () => select(() => onMove(d.id)),
    }));

  const hasSeparator = ownRouteItems.length > 0 && driverItems.length > 0;
  const allItems = [...ownRouteItems, ...driverItems];

  // ---- open / position -------------------------------------------------------
  const openMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedHeight =
      allItems.length * ITEM_HEIGHT + MENU_PADDING_Y + (hasSeparator ? SEPARATOR_HEIGHT : 0);
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER;
    const left = Math.max(VIEWPORT_GUTTER, Math.min(rect.right - MENU_WIDTH, maxLeft));
    const fitsBelow = rect.bottom + TRIGGER_GAP + estimatedHeight <= window.innerHeight - VIEWPORT_GUTTER;
    const top = fitsBelow
      ? rect.bottom + TRIGGER_GAP
      : Math.max(VIEWPORT_GUTTER, rect.top - TRIGGER_GAP - estimatedHeight);
    setPosition({ top, left });
    setMenuState('open');
  };

  // ---- close on outside pointer / Escape / scroll / resize -------------------
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    // Any scroll (panel, sheet, page) or resize invalidates the fixed position.
    const onScrollOrResize = (e: Event) => {
      if (e.type === 'scroll' && e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, close]);

  // ---- focus management -------------------------------------------------------
  useEffect(() => {
    if (menuState === 'open') {
      // Focus the first enabled item once the portal has mounted.
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
      first?.focus();
    } else if (menuState === 'closed-restore') {
      triggerRef.current?.focus();
    }
  }, [menuState]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (items.length === 0) return;
    const current = items.findIndex((el) => el === document.activeElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Tab':
        // Menus are not tab-stops: Tab closes it and hands focus back to the
        // trigger (the popover lives in a portal, so letting the browser move
        // focus would land somewhere unrelated at the end of <body>).
        e.preventDefault();
        close(true);
        break;
      default:
        break;
    }
  };

  const menuStyle: CSSProperties = { top: position.top, left: position.left, width: MENU_WIDTH };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : openMenu())}
        disabled={disabled}
        aria-label={`${isAssigned ? 'Move' : 'Assign'} ${address}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors',
          'hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900',
          'disabled:cursor-not-allowed disabled:opacity-40',
          open && 'bg-slate-100 text-slate-900',
          className,
        )}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`${isAssigned ? 'Move' : 'Assign'} ${address}`}
            onKeyDown={onMenuKeyDown}
            style={menuStyle}
            className="fixed z-50 rounded-xl border border-slate-200 bg-white py-1 text-sm text-slate-900 shadow-lg ring-1 ring-black/5"
          >
            <p className="truncate px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              {address}
            </p>
            {ownRouteItems.map((item) => (
              <MenuButton key={item.key} item={item} />
            ))}
            {hasSeparator && <div role="separator" className="my-1 h-px bg-slate-100" />}
            {driverItems.map((item) => (
              <MenuButton key={item.key} item={item} />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuButton({ item }: { item: MenuItem }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={item.disabled}
      onClick={item.onSelect}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 px-3 text-left transition-colors',
        'hover:bg-slate-50 focus:bg-slate-100 focus:outline-none',
        'disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-slate-500">{item.icon}</span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}
