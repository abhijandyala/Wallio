import { AppShell } from "@/components/kit/app-shell";

/** Every app screen (Home, My AI, Discover, Compare, Decisions, Settings) sits inside the rail. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
