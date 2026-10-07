"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="about-nav" aria-label="About this prototype">
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
