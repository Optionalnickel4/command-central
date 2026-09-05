"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/sol", label: "Systems / Sol" },
  { href: "/media", label: "Media" },
  { href: "/vault", label: "Vault" }
];

export default function PrimaryNav({ esports }: { esports: boolean }) {
  const pathname = usePathname();
  const links = esports ? [...BASE_LINKS, { href: "/#section-esports", label: "Esports" }] : BASE_LINKS;
  return (
    <nav aria-label="Primary" className="mb-3 flex gap-1 overflow-x-auto pb-1">
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return <Link key={link.label} href={link.href} aria-current={active ? "page" : undefined} className={`cmd-chip min-h-11 shrink-0 inline-flex items-center ${active ? "border-cyan-300/60 text-cyan-100" : ""}`}>{link.label}</Link>;
      })}
    </nav>
  );
}
