import { Instrument_Sans } from "next/font/google";

/**
 * The reference uses FFF Acid Grotesk, a paid font we don't have a license for.
 * Instrument Sans is the closest free grotesk; swap it here if we buy one.
 */
export const gxFont = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-gx" });
