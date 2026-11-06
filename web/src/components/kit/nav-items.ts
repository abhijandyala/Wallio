import { decisionsSample } from "@/mocks/decisions";

/** Every destination in the app, in rail order. `hint` is the one-line explanation shown on hover. */
export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home", hint: "Your AI setup at a glance" },
  {
    href: "/my-ai",
    label: "My AI",
    icon: "wallet",
    hint: "Your tools and what Wallio knows about you",
  },
  {
    href: "/discover",
    label: "Discover",
    icon: "discover",
    hint: "Tools that could fit your work",
  },
  {
    href: "/compare",
    label: "Compare",
    icon: "compare",
    hint: "Test two tools on your own task",
  },
  {
    href: "/decisions",
    label: "Decisions",
    icon: "decisions",
    hint: "What to keep, try, or approve",
    // TODO(api): count of approvals waiting, from the decisions endpoint.
    count: decisionsSample.approvals.length,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
    hint: "Account, connections, and your data",
  },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
export type NavIcon = NavItem["icon"];
