import Link from "next/link";
import { ButtonLink } from "@/components/kit/button-link";
import { Wordmark } from "@/components/kit/wordmark";

/** The frame for pages outside the app rail: landing, privacy, terms. */

export const REPO = "https://github.com/abhijandyala/Wallio";

const TEAM = [
  { name: "Abhijan Jandyala", role: "Product UI" },
  { name: "Anish Alleti", role: "Backend, AI, Vultr control plane" },
  { name: "Adhvik Vala", role: "Browser runner" },
];

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 sm:px-6">
      <TopBar />
      {children}
      <Footer />
    </div>
  );
}

const navLink = "hidden text-text-2 transition-colors hover:text-text-1";

export function TopBar() {
  return (
    <header className="flex h-16 items-center justify-between gap-6">
      <Link href="/" aria-label="Wallio home">
        <Wordmark className="[&_span]:text-[17px] [&_svg]:h-[15px]" />
      </Link>
      <nav className="flex items-center gap-6 text-[14px]">
        <Link href="/#how" className={`${navLink} md:block`}>
          How it works
        </Link>
        <Link href="/#safety" className={`${navLink} md:block`}>
          Safety
        </Link>
        <Link href="/#vultr" className={`${navLink} lg:block`}>
          Built on Vultr
        </Link>
        <Link href="/#questions" className={`${navLink} lg:block`}>
          Questions
        </Link>
        <Link href="/#judges" className={`${navLink} md:block`}>
          For judges
        </Link>
        <ButtonLink href="/start" variant="secondary" size="sm">
          Open the app
        </ButtonLink>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="grid grid-cols-1 gap-8 border-t border-line py-8 text-[13px] sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto] lg:gap-16">
      <div className="flex flex-col gap-3">
        <Wordmark className="text-text-2" />
        <p className="text-text-3">Built for the Vultr Agent Rush hackathon, Blast Radius Zero track.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {TEAM.map((t) => (
          <li key={t.name} className="flex flex-wrap gap-x-2">
            <span className="text-text-2">{t.name}</span>
            <span className="text-text-3">{t.role}</span>
          </li>
        ))}
      </ul>
      <nav className="flex gap-6 text-text-3 lg:flex-col lg:gap-2">
        <Link href="/privacy" className="transition-colors hover:text-text-1">
          Privacy
        </Link>
        <Link href="/terms" className="transition-colors hover:text-text-1">
          Terms
        </Link>
        <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-text-1">
          GitHub
        </a>
      </nav>
    </footer>
  );
}

export function SectionHead({ id, title, line }: { id: string; title: string; line: string }) {
  return (
    <header id={id} className="flex scroll-mt-8 flex-col gap-2">
      <h2 className="display text-[28px] leading-[34px] font-medium text-text-1 sm:text-[32px] sm:leading-[38px]">
        {title}
      </h2>
      <p className="max-w-[44rem] text-[15px] text-text-2">{line}</p>
    </header>
  );
}

/** Plain text page (privacy, terms): a title, an updated line, then short sections. */
export function TextPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: { heading: string; body: React.ReactNode }[];
}) {
  return (
    <SiteShell>
      <main id="main" className="flex max-w-[44rem] flex-col gap-10 pt-10 pb-24 sm:pt-16">
        <header className="flex flex-col gap-2">
          <h1 className="display text-[40px] leading-[44px] font-medium text-text-1">{title}</h1>
          <p className="text-[13px] text-text-3">{updated}</p>
        </header>
        {sections.map((s) => (
          <section key={s.heading} className="flex flex-col gap-3">
            <h2 className="text-[17px] font-medium text-text-1">{s.heading}</h2>
            <div className="flex flex-col gap-3 text-[15px] leading-6 text-text-2">{s.body}</div>
          </section>
        ))}
      </main>
    </SiteShell>
  );
}
