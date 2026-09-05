import type { Metadata } from "next";
// Self-hosted fonts (bundled via @fontsource) instead of next/font/google,
// so the production build has NO network dependency — it builds fine on a
// LAN-only box with no outbound internet. Weights below match what the
// design uses; add more @fontsource imports if you introduce new ones.
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import HashFocus from "@/components/hash-focus";

export const metadata: Metadata = {
  title: "Command central",
  description: "Homelab and daily-info dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-boot ships in the SSR markup so panels hold at frame 0 of their
  // power-on animation until <BootSequence/> hands over. It removes the
  // attribute — immediately when prefers-reduced-motion is set.
  return (
    <html lang="en" data-boot="active">
      <body className="font-body"><a className="skip-link" href="#main-content">Skip to main content</a><HashFocus />{children}</body>
    </html>
  );
}
