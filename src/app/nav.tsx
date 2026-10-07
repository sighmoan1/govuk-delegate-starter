"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/delegates", label: "Delegate" },
  { href: "/activity", label: "Activity" },
  { href: "/about", label: "About this project" },
  { href: "/agent", label: "Demo agent" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={path === l.href || path.startsWith(l.href + "/") ? "page" : undefined}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
