import type { Metadata } from "next";
import "@/components/site/site.css";
import { gxFont } from "@/components/site/font";
import { Stage } from "@/components/site/stage/stage";
import { NavSection } from "@/components/site/sections/nav";
import { HeroSection } from "@/components/site/sections/hero";
import { LiquiditySection } from "@/components/site/sections/liquidity";
import { AccountsSection } from "@/components/site/sections/accounts";
import { StepsSection } from "@/components/site/sections/steps";
import { SocialSection } from "@/components/site/sections/social";
import { AiCoachSection } from "@/components/site/sections/ai-coach";
import { JournalSection } from "@/components/site/sections/journal";
import { VerifiedSection } from "@/components/site/sections/verified";
import { InstantSection } from "@/components/site/sections/instant";
import { FooterSection } from "@/components/site/sections/footer";

export const metadata: Metadata = {
  title: "Wallio",
};

/**
 * The landing page. Layout and motion follow the reference site; colors are ours and
 * every piece of copy is "(insert here)" until we write it.
 */
export default function LandingPage() {
  return (
    <div className={`gx-root ${gxFont.variable} relative`}>
      <Stage />
      <NavSection />
      <main id="main" className="relative z-10">
        <HeroSection />
        <LiquiditySection />
        <AccountsSection />
        <StepsSection />
        <SocialSection />
        <AiCoachSection />
        <JournalSection />
        <VerifiedSection />
        <InstantSection />
      </main>
      <FooterSection />
    </div>
  );
}
