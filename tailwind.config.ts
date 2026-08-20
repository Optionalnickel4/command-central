import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Broadcast/scoreboard token system — see README for the design rationale.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E14",        // page background
        panel: "#131822",      // resting card surface
        raised: "#1B2230",     // hovered / elevated surface
        hairline: "#242C3B",   // borders/dividers
        live: "#22C58B",       // online / good
        alert: "#E5484D",      // down / error
        warn: "#F5A623",       // degraded / warning, also primary accent
        info: "#3E8EF7",       // informational accent
        ivory: "#EDEFF4",      // primary text
        // Keeping `slate` as a bare token (text-slate → #8A93A6) while
        // RESTORING the numeric scale. Overriding it with a flat string
        // silently deletes every slate-50…950 utility, which left inputs
        // with the UA's white background and bubbles with preflight's grey
        // border — near-white text on white. Verified in the browser.
        slate: { ...colors.slate, DEFAULT: "#8A93A6" }
      },
      fontFamily: {
        display: ["Oswald", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: []
};
export default config;
