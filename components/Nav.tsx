"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    label: "Today",
    icon: <path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    href: "/chat",
    label: "Coach",
    icon: <path d="M4 5h16v11H8l-4 4V5Z" strokeLinejoin="round" />,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
      </>
    ),
  },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <nav className="nav">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={pathname === it.href ? "active" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {it.icon}
          </svg>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
