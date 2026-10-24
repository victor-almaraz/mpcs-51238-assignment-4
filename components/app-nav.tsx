"use client";
// The top bar's destinations (docs/design/README.md, App frame): links with aria-current on expanded
// screens; on compact screens a menu button that opens them in a sheet.
import { Bell, BookOpen, Castle, LayoutDashboard, Menu, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ICON, ICON_DENSE } from "./ui/icon-button";
import { Sheet } from "./ui/sheet";
import { cx } from "./ui/cx";

const DESTINATIONS: { href: string; label: string; icon: ReactNode; match: string[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard {...ICON_DENSE} />, match: ["/dashboard"] },
  { href: "/characters", label: "Characters", icon: <Users {...ICON_DENSE} />, match: ["/characters"] },
  { href: "/campaigns", label: "Campaigns", icon: <Castle {...ICON_DENSE} />, match: ["/campaigns", "/instances"] },
  { href: "/adventures", label: "Adventures", icon: <BookOpen {...ICON_DENSE} />, match: ["/adventures"] },
];

const current = (path: string, match: string[]) => match.some((m) => path === m || path.startsWith(`${m}/`));

export function MainNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {DESTINATIONS.map((d) => {
        const here = current(path, d.match);
        return (
          <Link key={d.href} href={d.href} aria-current={here ? "page" : undefined} className={cx("inline-flex h-9 items-center gap-2 rounded-control px-3 text-control font-medium", here ? "bg-accent-soft text-accent" : "text-ink hover:bg-desk")}>
            {d.icon}
            {d.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function UtilityLinks() {
  const path = usePathname();
  const link = (href: string, label: string, icon: ReactNode) => (
    <Link href={href} aria-label={label} title={label} aria-current={path === href ? "page" : undefined} className="inline-flex size-9 items-center justify-center rounded-control text-ink hover:bg-desk aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent">
      {icon}
    </Link>
  );
  return (
    <>
      {link("/notifications", "Notifications", <Bell {...ICON} />)}
      <span className="hidden md:inline-flex">{link("/settings", "Settings", <Settings {...ICON} />)}</span>
    </>
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label="Menu" title="Menu" aria-haspopup="dialog" className="inline-flex size-9 items-center justify-center rounded-control hover:bg-desk">
        <Menu {...ICON} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {[...DESTINATIONS, { href: "/notifications", label: "Notifications", icon: <Bell {...ICON_DENSE} />, match: ["/notifications"] }, { href: "/settings", label: "Settings", icon: <Settings {...ICON_DENSE} />, match: ["/settings"] }].map((d) => {
              const here = current(path, d.match);
              return (
                <li key={d.href}>
                  <Link href={d.href} onClick={() => setOpen(false)} aria-current={here ? "page" : undefined} className={cx("flex h-11 items-center gap-3 rounded-control px-3 text-control font-medium", here ? "bg-accent-soft text-accent" : "hover:bg-desk")}>
                    {d.icon}
                    {d.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Sheet>
    </div>
  );
}
