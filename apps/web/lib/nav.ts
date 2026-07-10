import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  description: string;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard", description: "Overview & quick tools" },
  { href: "/new-case", label: "New Case", icon: "new-case", description: "Patient intake" },
  { href: "/case-analysis", label: "Case Analysis", icon: "analysis", description: "Clinical reasoning" },
  { href: "/treatment-planner", label: "Treatment Planner", icon: "treatment", description: "Build a rehab plan" },
  { href: "/exercise-library", label: "Exercise Library", icon: "exercise", description: "Searchable exercises" },
  { href: "/ai-assistant", label: "AI Assistant", icon: "chat", description: "Ask clinical questions" },
  { href: "/red-flags", label: "Red Flag Checker", icon: "flag", description: "Safety screening" },
  { href: "/patient-education", label: "Patient Education", icon: "education", description: "Plain-language handouts" },
  { href: "/settings", label: "Settings", icon: "settings", description: "Preferences" },
];
