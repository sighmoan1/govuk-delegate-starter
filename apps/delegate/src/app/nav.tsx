"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  const path = usePathname();
  return (
    <nav className="site-nav" aria-label={label}>
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
