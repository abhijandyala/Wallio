import { Host_Grotesk } from "next/font/google";

/**
 * The reference uses FFF Acid Grotesk, a paid font we don't have a license for.
 * Host Grotesk (OFL) is the closest free match by width and letterforms, picked by setting
 * the reference's hero line side by side; swap it here if we buy Acid Grotesk.
 */
export const gxFont = Host_Grotesk({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-gx" });
