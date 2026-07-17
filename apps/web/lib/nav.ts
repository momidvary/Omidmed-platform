import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  /** i18n key: label = `nav.${key}`, description = `nav.${key}.desc` */
  key: string;
  icon: IconName;
}

export const navItems: NavItem[] = [
  { href: "/", key: "dashboard", icon: "dashboard" },
  { href: "/patients", key: "patients", icon: "user" },
  { href: "/new-case", key: "new-case", icon: "new-case" },
  { href: "/case-analysis", key: "case-analysis", icon: "analysis" },
  { href: "/treatment-planner", key: "treatment-planner", icon: "treatment" },
  { href: "/exercise-library", key: "exercise-library", icon: "exercise" },
  { href: "/ai-assistant", key: "ai-assistant", icon: "chat" },
  { href: "/posture-analysis", key: "posture-analysis", icon: "user" },
  { href: "/red-flags", key: "red-flags", icon: "flag" },
  { href: "/patient-education", key: "patient-education", icon: "education" },
  { href: "/settings", key: "settings", icon: "settings" },
];
