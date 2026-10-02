"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SettingsNavProps {
  isOwner: boolean;
  workspaceId: string;
}

export function SettingsNav({ workspaceId, isOwner }: SettingsNavProps) {
  const pathname = usePathname();

  const items = [
    { label: "General", href: `/${workspaceId}/settings/general` },
    { label: "Members", href: `/${workspaceId}/settings/members` },
    { label: "Limits", href: `/${workspaceId}/settings/limits` },
    ...(isOwner
      ? [{ label: "Security", href: `/${workspaceId}/settings/security` }]
      : []),
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden md:sticky md:top-6 md:w-[200px] md:shrink-0 md:flex-col md:self-start md:overflow-visible">
      {items.map((item) => (
        <Link
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
            pathname === item.href
              ? "bg-base-200 font-medium text-base-content"
              : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
          )}
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
