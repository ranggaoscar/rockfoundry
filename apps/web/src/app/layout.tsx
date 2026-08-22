import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RockFoundry | Product discovery for coding agents",
  description:
    "A local-first agentic product architect that turns rough ideas into BRD, PRD, and ERD documents.",
  icons: {
    icon: "/brand/rockfoundry-icon.svg",
    shortcut: "/brand/rockfoundry-icon.svg",
    apple: "/brand/rockfoundry-icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${geistSans.className}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-background font-sans text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
