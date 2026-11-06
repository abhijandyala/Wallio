import type { Metadata } from "next";
import "@/components/landing/landing.css";
import { wlFont } from "@/components/landing/font";
import { GlowCanvas } from "@/components/kit/glow-canvas";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { STATEMENTS } from "@/components/landing/content";
import { Header } from "@/components/landing/sections/header";
import { Hero, ScrollText } from "@/components/landing/sections/hero";
import { Statement } from "@/components/landing/sections/statement";
import { Explore } from "@/components/landing/sections/explore";
import { Limits } from "@/components/landing/sections/limits";
import { Vultr } from "@/components/landing/sections/vultr";
import { Steps } from "@/components/landing/sections/steps";
import { Proof } from "@/components/landing/sections/proof";
import { Footer } from "@/components/landing/sections/footer";

export const metadata: Metadata = {
  title: "Wallio: your personal AI wallet",
  description: "Track every AI tool you pay for, test a new one against yours on your own task, and act only after you approve.",
};

/**
 * The landing page. Layout, motion and hover detail follow the reference (auros.global),
 * measured at 1512 x 944; colours and every word are Wallio's.
 */
export default function LandingPage() {
  return (
    <div className={`wl-root ${wlFont.variable} relative`}>
      <SmoothScroll />
      <GlowCanvas />
      <Header />
      <main id="main">
        <Hero />
        <ScrollText />
        <Statement lines={STATEMENTS.intro} className="max-w-[70.5rem]" />
        <Explore />
        <Limits />
        <Statement lines={STATEMENTS.receipts} className="max-w-[61rem]" />
        <Vultr />
        <Statement lines={STATEMENTS.approval} className="max-w-[68.5rem]" />
        <Steps />
        <Statement lines={STATEMENTS.keep} className="max-w-[58.7rem]" />
        <Proof />
      </main>
      <Footer />
    </div>
  );
}
