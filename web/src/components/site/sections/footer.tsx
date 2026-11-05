import Link from "next/link";
import { AppStoreLogo, Desktop, GooglePlayLogo, Globe, Circle } from "@phosphor-icons/react/dist/ssr";
import { LogoMark } from "@/components/kit/logo-mark";
import { Container, P } from "../ui";

const COLUMNS = [4, 4, 5];
const PLATFORMS = [Globe, Desktop, AppStoreLogo, GooglePlayLogo];

/** Footer: brand and links, platform cards, a giant watermark word on a lime glow, disclosures. */
export function FooterSection() {
  return (
    <footer className="relative z-10 mt-[2.4375rem] overflow-hidden border-t border-white/[0.06] bg-[linear-gradient(180deg,#07080a,#010102_60%)] pb-[0.5rem]">
      <Container className="relative">
        <div className="flex justify-between pt-[3.2rem] max-md:flex-col max-md:gap-10">
          <div className="flex w-[21.6875rem] flex-col max-md:w-full">
            <Link href="/" aria-label="Home" className="flex items-center gap-[0.6rem] text-[var(--gx-text)]">
              <LogoMark className="h-[1.35rem] w-auto" />
              <span className="font-brand text-[1.55rem] leading-none font-bold tracking-[-0.01em]">Wallio</span>
            </Link>
            <p className="mt-[1.25rem] text-[0.9036rem] text-[var(--gx-text)]">{P}</p>
            <p className="mt-[0.6rem] text-[0.8033rem] leading-[1.45] text-[var(--gx-muted)]">
              {P} {P}
              <br />
              {P} {P}
            </p>
            <p className="mt-[0.4rem] text-[0.8033rem] text-[var(--gx-muted)]">{P}</p>
            <div className="mt-[1.2rem] flex gap-[1.3rem] text-[var(--gx-text)]">
              {[0, 1, 2].map((i) => (
                <Circle key={i} weight="fill" className="size-[0.85rem] opacity-90" aria-label={P} />
              ))}
            </div>
          </div>

          <nav className="grid w-[51.4375rem] grid-cols-[22rem_22.875rem_auto] max-md:w-full max-md:grid-cols-2 max-md:gap-y-8">
            {COLUMNS.map((n, c) => (
              <div key={c} className="flex flex-col gap-[1.15rem]">
                <span className="text-[0.8033rem] text-[var(--gx-accent)]">{P}</span>
                {Array.from({ length: n }, (_, i) => (
                  <Link key={i} href="#" className="text-[0.8033rem] text-[var(--gx-muted)] transition-colors hover:text-[var(--gx-text)]">
                    {P}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="relative z-[1] mt-[3.375rem] flex gap-[1rem] max-md:grid max-md:grid-cols-2">
          {PLATFORMS.map((Icon, i) => (
            <Link
              key={i}
              href="#"
              className="flex h-[5.25rem] w-[13.8125rem] items-center gap-[0.8rem] rounded-[1.326rem] border border-white/[0.06] bg-[radial-gradient(68.16%_68.71%_at_65.73%_3.01%,color-mix(in_srgb,#58f6b1_5%,rgb(5_5_7/0.3))_19.23%,rgb(1_1_1/0.3)_72.6%)] px-[1.125rem] backdrop-blur-[9px] max-md:w-full"
            >
              <Icon className="size-[1.3rem] shrink-0 text-[var(--gx-text)]" />
              <span className="flex flex-col leading-tight">
                <span className="text-[0.75rem] text-[var(--gx-muted)]">{P}</span>
                <span className="text-[0.9036rem] text-[var(--gx-text)]">{P}</span>
              </span>
            </Link>
          ))}
        </div>

        {/* Watermark word over a lime glow */}
        <div className="relative -mt-[0.45rem] h-[12.5625rem] max-md:h-[7rem]">
          <span aria-hidden="true" className="pointer-events-none absolute top-[-2.1rem] left-1/2 h-[17.7rem] w-[44.2rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,#58f6b1_35%,transparent),transparent_70%)] max-md:w-full" />
          <p
            aria-hidden="true"
            className="gx-heading absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11.4rem] leading-none whitespace-nowrap opacity-50 [mask-image:linear-gradient(#000_40%,transparent)] max-md:text-[3.4rem]"
          >
            {P}
          </p>
        </div>

        <div className="mt-[3.375rem] flex flex-col gap-[0.32rem]">
          <span className="mb-[0.5rem] text-[0.8033rem] text-[var(--gx-text)]">{P}</span>
          {[3, 2, 3, 3].map((lines, i) => (
            <p key={i} className="text-[0.6024rem] leading-[1.55] text-[var(--gx-dim)]">
              {Array.from({ length: lines * 16 }, () => P).join(" ")}
            </p>
          ))}
        </div>

        <div className="flex items-center justify-between gap-[1.6rem] py-[1rem] text-[0.6024rem] text-[var(--gx-dim)] max-md:flex-col max-md:items-start">
          <span>{P}</span>
          <span className="flex flex-wrap gap-[1.6rem]">
            {Array.from({ length: 5 }, (_, i) => (
              <Link key={i} href="#" className="transition-colors hover:text-[var(--gx-text)]">
                {P}
              </Link>
            ))}
          </span>
        </div>
      </Container>
    </footer>
  );
}
