"use client";

// Small dropdown menu (Typeform style): click to open, closes on outside click / Escape,
// items can open a submenu to the side.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  divider?: boolean; // draw a line above this item
  submenu?: MenuItem[];
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function Menu({
  items,
  trigger,
  align = "right",
  label = "More actions",
  className,
}: {
  items: MenuItem[];
  trigger?: React.ReactNode;
  align?: "left" | "right";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<number | null>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
        setSub(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSub(null);
      }
    };
    const onScroll = () => {
      setOpen(false);
      setSub(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setSub(null);
  };

  return (
    <div ref={root} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={trigger && label === "More actions" ? undefined : label}
        onClick={(e) => {
          e.stopPropagation();
          // fixed position so tables with overflow never clip the menu; flip up near the bottom
          const r = e.currentTarget.getBoundingClientRect();
          const est = 38 * items.length + 16 * items.filter((i) => i.divider).length + 16;
          const vh = window.innerHeight;
          const top = r.bottom + 4 + est <= vh ? r.bottom + 4 : r.top - 4 - est >= 0 ? r.top - 4 - est : Math.max(8, vh - est - 8);
          setPos({
            position: "fixed",
            top,
            ...(align === "right" ? { right: window.innerWidth - r.right } : { left: r.left }),
          });
          setOpen((o) => !o);
        }}
        className={trigger ? "" : "flex h-8 w-8 items-center justify-center rounded-md text-[#5e5e5e] hover:bg-[#f0f0f0] hover:text-[#262627]"}
      >
        {trigger ?? (
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="currentColor">
            <circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" />
          </svg>
        )}
      </button>
      {open && (
        <div
          role="menu"
          style={pos}
          className="z-[55] min-w-[200px] rounded-lg border border-[#e3e3e3] bg-white py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <MenuList items={items} sub={sub} setSub={setSub} close={close} align={align} />
        </div>
      )}
    </div>
  );
}

function MenuList({
  items,
  sub,
  setSub,
  close,
  align,
}: {
  items: MenuItem[];
  sub: number | null;
  setSub: (n: number | null) => void;
  close: () => void;
  align: "left" | "right";
}) {
  return (
    <>
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className="relative">
          {it.divider && <div className="my-1.5 border-t border-[#ececec]" />}
          {it.href ? (
            <a
              role="menuitem"
              href={it.href}
              onClick={close}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] text-[#262627] hover:bg-[#f5f5f5]"
            >
              {it.icon}
              {it.label}
            </a>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              aria-haspopup={it.submenu ? "menu" : undefined}
              aria-expanded={it.submenu ? sub === i : undefined}
              onMouseEnter={() => setSub(it.submenu ? i : null)}
              onClick={(e) => {
                e.stopPropagation();
                if (it.submenu) return setSub(sub === i ? null : i);
                close();
                it.onSelect?.();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] hover:bg-[#f5f5f5] disabled:opacity-40",
                it.danger ? "text-[#c2331d]" : "text-[#262627]",
              )}
            >
              {it.icon}
              <span className="flex-1">{it.label}</span>
              {it.submenu && <span aria-hidden className="text-[#6b6b6b]">›</span>}
            </button>
          )}
          {it.submenu && sub === i && (
            <div
              role="menu"
              className={cn(
                "absolute top-0 z-50 min-w-[190px] rounded-lg border border-[#e3e3e3] bg-white py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
                align === "right" ? "right-full mr-1" : "left-full ml-1",
              )}
            >
              {it.submenu.length === 0 && <p className="px-3.5 py-2 text-[13px] text-[#6b6b6b]">Nothing here</p>}
              {it.submenu.map((s, j) => (
                <button
                  key={`${s.label}-${j}`}
                  type="button"
                  role="menuitem"
                  disabled={s.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                    s.onSelect?.();
                  }}
                  className="flex w-full items-center px-3.5 py-2 text-left text-[14px] text-[#262627] hover:bg-[#f5f5f5] disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
