import type { IconName } from "@/components/ui/Icon";

/**
 * - main: always visible in the sidebar;
 * - tools: reference tools, grouped under a collapsible "Tools" heading;
 * - workflow: patient care steps reached from the patient workspace; not
 *   listed in the sidebar, which highlights their parent instead;
 * - footer: settings at the bottom of the sidebar.
 */
export type NavSection = "main" | "tools" | "workflow" | "footer";
export type AttentionKey = "alerts" | "tickets";

export interface NavItem {
  href: string;
  /** i18n key: label = `nav.${key}`, description = `nav.${key}.desc` */
  key: string;
  icon: IconName;
  section: NavSection;
  /** Sidebar entry to highlight while this page is open. */
  parent?: string;
  /** Other routes that belong to this entry (e.g. a patient workspace). */
  matches?: string[];
  /** Count of items waiting for the clinician, shown as a badge. */
  badge?: AttentionKey;
  /** Hidden from the sidebar unless the feature is switched on. */
  enabled?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", key: "dashboard", icon: "dashboard", section: "main" },
  { href: "/patients", key: "patients", icon: "users", section: "main", matches: ["/workspace"] },
  { href: "/alerts", key: "alerts", icon: "alert", section: "main", badge: "alerts" },
  { href: "/tickets", key: "tickets", icon: "inbox", section: "main", badge: "tickets" },
  { href: "/new-case", key: "new-case", icon: "new-case", section: "workflow", parent: "/patients" },
  { href: "/case-analysis", key: "case-analysis", icon: "analysis", section: "workflow", parent: "/patients" },
  { href: "/treatment-planner", key: "treatment-planner", icon: "treatment", section: "workflow", parent: "/patients" },
  { href: "/clinical-records", key: "clinical-records", icon: "edit", section: "workflow", parent: "/patients" },
  { href: "/exercise-library", key: "exercise-library", icon: "exercise", section: "tools" },
  { href: "/ai-assistant", key: "ai-assistant", icon: "sparkle", section: "tools" },
  { href: "/red-flags", key: "red-flags", icon: "flag", section: "tools" },
  { href: "/patient-education", key: "patient-education", icon: "education", section: "tools" },
  {
    href: "/posture-analysis",
    key: "posture-analysis",
    icon: "user",
    section: "tools",
    enabled: process.env.NEXT_PUBLIC_ENABLE_POSTURE_SANDBOX === "true",
  },
  { href: "/settings", key: "settings", icon: "settings", section: "footer" },
];

function owns(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.matches ?? [])].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** The page the user is on, for the top-bar title. */
export function currentNavItem(pathname: string): NavItem | undefined {
  return navItems.find((item) => owns(item, pathname));
}

/** Whether a sidebar entry should be highlighted for this route. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const current = currentNavItem(pathname);
  if (!current) return false;
  return current.href === item.href || current.parent === item.href;
}

export function sidebarItems(section: NavSection): NavItem[] {
  return navItems.filter(
    (item) => item.section === section && item.enabled !== false
  );
}
