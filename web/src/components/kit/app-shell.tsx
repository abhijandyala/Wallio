import { RailNav } from "./rail-nav";
import { GlowCanvas } from "./glow-canvas";
import { Prefetch } from "./prefetch";

/**
 * The app frame: full-width content with the Wallio bar along the bottom edge.
 * Every page renders inside this. Pages never build their own frame.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* The landing page's mint light, dimmed, behind everything. */}
      <GlowCanvas strength={0.5} className="z-0" />
      <RailNav />
      <Prefetch />
      {/* Bottom padding = bar height (44 / 56) + room to finish scrolling (64). */}
      <main
        id="main"
        className="relative z-[1] px-4 pt-6 pb-[108px] sm:px-6 sm:pb-[120px]"
      >
        {children}
      </main>
    </div>
  );
}
