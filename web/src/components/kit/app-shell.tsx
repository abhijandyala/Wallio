import { RailNav } from "./rail-nav";
import { GlowCanvas } from "./glow-canvas";

/**
 * The app frame: the Wallio rail on the left edge and full-width content beside it.
 * Every page renders inside this. Pages never build their own frame.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* The landing page's mint light, dimmed, behind everything. */}
      <GlowCanvas strength={0.5} className="z-0" />
      <RailNav />
      {/* Left padding = rail width (44 / 56) + page inset (16 / 24). */}
      <main
        id="main"
        className="relative z-[1] pt-6 pr-4 pb-16 pl-[60px] sm:pr-6 sm:pl-[80px]"
      >
        {children}
      </main>
    </div>
  );
}
