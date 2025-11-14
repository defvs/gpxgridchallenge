import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "leaflet/dist/leaflet.css";

import "./globals.css";
import { isClerkConfigured } from "../lib/auth-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GPX Grid Challenge",
  description:
    "Upload GPX files, color a custom OpenStreetMap grid, and chase full coverage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const layout = (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );

  return isClerkConfigured ? <ClerkProvider>{layout}</ClerkProvider> : layout;
}
