import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import { MotionPrefs } from "@/components/kit/motion-prefs";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Brand wordmark only ("Wallio"). Everything else stays Geist.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Wallio",
  description:
    "Your personal AI wallet. Know what you have, test what's new, decide with receipts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} dark h-full`}
    >
      <body className="min-h-full">
        <TooltipProvider delay={200}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface-3 focus:px-3 focus:py-2"
          >
            Skip to content
          </a>
          <MotionPrefs>{children}</MotionPrefs>
        </TooltipProvider>
      </body>
    </html>
  );
}
