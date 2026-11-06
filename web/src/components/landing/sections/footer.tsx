import Link from "next/link";
import { GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { Btn, Container } from "../ui";
import { FOOTER } from "../content";

/**
 * Footer, as on the reference: the line on the left, the call to action on the right, a
 * row of caps links split by thin rules, the code link as a round icon, and a tiny bottom
 * line. Ours adds a short, plain note on what is real today.
 */
export function Footer() {
  return (
    <footer className="relative pt-[8.75rem] pb-[2.5rem] max-md:pt-20">
      <Container>
        <div className="flex items-start justify-between gap-10 max-md:flex-col">
          <h2 className="wl-h1">
            {FOOTER.title[0]}
            <br />
            {FOOTER.title[1]}
          </h2>
          <div className="flex flex-col items-end max-md:items-start">
            <p className="text-[2.25rem] leading-[2.925rem]">{FOOTER.cta.lead}</p>
            <Btn href={FOOTER.cta.href} className="mt-[1.5rem]">
              {FOOTER.cta.label}
            </Btn>
          </div>
        </div>

        <div className="mt-[10rem] flex items-end justify-between gap-8 max-md:mt-16 max-md:flex-col max-md:items-start">
          <nav aria-label="Footer" className="flex flex-col gap-[0.5rem]">
            {FOOTER.links.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center">
                {row.map(([label, href], j) => (
                  <span key={href} className="flex items-center">
                    {j > 0 && <span aria-hidden="true" className="mx-[0.9rem] h-[0.9rem] w-px bg-white/25" />}
                    <Link
                      href={href}
                      {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      className="text-[1.25rem] leading-[1.625rem] text-[var(--wl-silver)] uppercase transition-opacity duration-200 hover:opacity-60"
                    >
                      {label}
                    </Link>
                  </span>
                ))}
              </div>
            ))}
          </nav>
          <a
            href={FOOTER.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="Wallio on GitHub"
            className="grid size-[2.5rem] place-items-center rounded-full border border-white/35 text-white transition-opacity duration-200 hover:opacity-60"
          >
            <GithubLogo className="size-[1.1rem]" />
          </a>
        </div>

        <p className="mt-[4rem] max-w-[62rem] text-[0.8rem] leading-[1.25rem] text-[var(--wl-silver)]/80">{FOOTER.note}</p>

        <div className="mt-[2.5rem] flex justify-between text-[0.625rem] leading-[0.875rem] tracking-[0.094rem] text-white uppercase">
          <span>{FOOTER.left}</span>
          <span>{FOOTER.right}</span>
        </div>
      </Container>
    </footer>
  );
}
