import Link from "next/link";
import { AppWindow, Code, GithubLogo, Globe, Play, Pulse } from "@phosphor-icons/react/dist/ssr";
import { LogoMark } from "@/components/kit/logo-mark";
import { Container } from "../ui";
import { FOOTER, LINKS } from "../content";

const PLATFORM_ICONS = { app: AppWindow, play: Play, code: Code, api: Pulse } as const;
const SOCIAL = [
  { label: "Wallio on GitHub", href: LINKS.repo, Icon: GithubLogo },
  { label: "Compare, live", href: LINKS.live, Icon: Play },
  { label: "Live API on Vultr", href: LINKS.api, Icon: Globe },
];
const external = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {});

/** Footer: brand and links, platform cards, a giant watermark word on a lime glow, disclosures. */
export function FooterSection() {
  return (
    <footer id="judges" className="relative z-10 mt-[2.4375rem] overflow-hidden border-t border-white/[0.06] bg-[linear-gradient(180deg,#07080a,#010102_60%)] pb-[0.5rem]">
      <Container className="relative">
        <div className="flex justify-between pt-[3.2rem] max-md:flex-col max-md:gap-10">
          <div className="flex w-[21.6875rem] flex-col max-md:w-full">
            <Link href="/" aria-label="Home" className="flex items-center gap-[0.6rem] text-[var(--gx-text)]">
              <LogoMark className="h-[1.35rem] w-auto" />
              <span className="font-brand text-[1.55rem] leading-none font-bold tracking-[-0.01em]">Wallio</span>
            </Link>
            <p className="mt-[1.25rem] text-[0.9036rem] text-[var(--gx-text)]">{FOOTER.tagline}</p>
            <p className="mt-[0.6rem] text-[0.8033rem] leading-[1.45] text-[var(--gx-muted)]">
              {FOOTER.about[0]}
              <br />
              {FOOTER.about[1]}
            </p>
            <p className="mt-[0.4rem] text-[0.8033rem] text-[var(--gx-muted)]">{FOOTER.team}</p>
            <div className="mt-[1.2rem] flex gap-[1.3rem] text-[var(--gx-text)]">
              {SOCIAL.map(({ label, href, Icon }) => (
                <a key={label} href={href} aria-label={label} {...external(href)} className="opacity-90 transition-opacity hover:opacity-100">
                  <Icon weight="fill" className="size-[0.95rem]" />
                </a>
              ))}
            </div>
          </div>

          <nav className="grid w-[51.4375rem] grid-cols-[22rem_22.875rem_auto] max-md:w-full max-md:grid-cols-2 max-md:gap-y-8">
            {FOOTER.columns.map((col) => (
              <div key={col.title} className="flex flex-col gap-[1.15rem]">
                <span className="text-[0.8033rem] text-[var(--gx-accent)]">{col.title}</span>
                {col.links.map(([label, href]) => (
                  <Link key={label} href={href} {...external(href)} className="text-[0.8033rem] text-[var(--gx-muted)] transition-colors hover:text-[var(--gx-text)]">
                    {label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="relative z-[1] mt-[3.375rem] flex gap-[1rem] max-md:grid max-md:grid-cols-2">
          {FOOTER.platforms.map((pl) => {
            const Icon = PLATFORM_ICONS[pl.icon as keyof typeof PLATFORM_ICONS];
            return (
            <Link
              key={pl.bottom}
              href={pl.href}
              {...external(pl.href)}
              className="flex h-[5.25rem] w-[13.8125rem] items-center gap-[0.8rem] rounded-[1.326rem] border border-white/[0.06] bg-[radial-gradient(68.16%_68.71%_at_65.73%_3.01%,color-mix(in_srgb,#58f6b1_5%,rgb(5_5_7/0.3))_19.23%,rgb(1_1_1/0.3)_72.6%)] px-[1.125rem] backdrop-blur-[9px] max-md:w-full"
            >
              <Icon className="size-[1.3rem] shrink-0 text-[var(--gx-text)]" />
              <span className="flex flex-col leading-tight">
                <span className="text-[0.75rem] text-[var(--gx-muted)]">{pl.top}</span>
                <span className="text-[0.9036rem] text-[var(--gx-text)]">{pl.bottom}</span>
              </span>
            </Link>
            );
          })}
        </div>

        {/* Watermark word over a lime glow */}
        <div className="relative -mt-[0.45rem] h-[12.5625rem] max-md:h-[7rem]">
          <span aria-hidden="true" className="pointer-events-none absolute top-[-2.1rem] left-1/2 h-[17.7rem] w-[44.2rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,#58f6b1_35%,transparent),transparent_70%)] max-md:w-full" />
          <p
            aria-hidden="true"
            className="gx-heading absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-brand text-[12.4rem] leading-none font-bold tracking-[-0.02em] whitespace-nowrap opacity-50 [mask-image:linear-gradient(#000_40%,transparent)] max-md:text-[5rem]"
          >
            {FOOTER.watermark}
          </p>
        </div>

        <div className="mt-[3.375rem] flex flex-col gap-[0.32rem]">
          <span className="mb-[0.5rem] text-[0.8033rem] text-[var(--gx-text)]">{FOOTER.disclosureTitle}</span>
          {FOOTER.disclosure.map((para) => (
            <p key={para.slice(0, 24)} className="text-[0.6024rem] leading-[1.55] text-[var(--gx-dim)] max-md:text-[0.75rem]">
              {para}
            </p>
          ))}
        </div>

        <div className="flex items-center justify-between gap-[1.6rem] py-[1rem] text-[0.6024rem] text-[var(--gx-dim)] max-md:flex-col max-md:items-start">
          <span>{FOOTER.copyright}</span>
          <span className="flex flex-wrap gap-[1.6rem]">
            {FOOTER.legal.map(([label, href]) => (
              <Link key={label} href={href} {...external(href)} className="transition-colors hover:text-[var(--gx-text)]">
                {label}
              </Link>
            ))}
          </span>
        </div>
      </Container>
    </footer>
  );
}
