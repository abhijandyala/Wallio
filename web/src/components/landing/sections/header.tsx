import Link from "next/link";
import { Btn } from "../ui";
import { NAV } from "../content";

/** The Wallio mark (white). */
export function Mark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/wallio-mark.svg" alt="" aria-hidden="true" className={className} />;
}

/**
 * Fixed bar across the top, as on the reference: a deep mint wash at 85% with a 15px blur
 * behind it, the mark and name on the left, tracked caps links in the middle that get a
 * faint fill on hover, and the light button on the right.
 */
export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="relative flex items-center justify-between px-[4rem] py-[0.75rem] before:absolute before:inset-0 before:bg-[rgba(9,52,37,0.85)] before:backdrop-blur-[15px] max-md:px-4">
        <Link href="/" className="relative flex items-center gap-[0.6rem] text-white" aria-label="Wallio home">
          <Mark className="h-[1.1rem] w-auto" />
          <span className="text-[1.35rem] leading-none font-semibold tracking-[0.08em] uppercase">Wallio</span>
        </Link>
        <nav className="relative flex items-center max-lg:hidden" aria-label="Main">
          {NAV.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-[0.375rem] px-[1rem] py-[1.25rem] text-[0.75rem] leading-[1.05rem] tracking-[0.09rem] text-white uppercase transition-colors duration-200 ease-in-out hover:bg-white/5"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Btn href={NAV.cta.href} className="relative">
          {NAV.cta.label}
        </Btn>
      </div>
    </header>
  );
}
