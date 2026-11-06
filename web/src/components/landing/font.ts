import { Figtree } from "next/font/google";

/**
 * The reference sets everything in Matter (a paid face). Figtree is the closest free
 * match we measured: at weight 600 it runs within 1% of Matter 500's width, with the same
 * single-storey g and open geometric forms. Variable, so weights between steps work.
 */
export const wlFont = Figtree({ subsets: ["latin"], variable: "--font-wl", display: "swap" });
