import { RailNav } from "./rail-nav";
import { MotionPrefs } from "./motion-prefs";

/**
 * The app frame: the Wallio rail on the left edge and full-width content beside it.
 * Every page renders inside this. Pages never build their own frame.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionPrefs>
    <div className="min-h-screen">
      <RailNav />
      {/* Left padding = rail width (44 / 56) + page inset (16 / 24). */}
      <main
        id="main"
        className="pt-6 pr-4 pb-16 pl-[60px] sm:pr-6 sm:pl-[80px]"
      >
        {children}
      </main>
    </div>
    </MotionPrefs>
  );
}
