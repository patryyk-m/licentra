import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/layout/Navbar";
import CookieConsentBanner from "@/components/cookie-consent-banner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Licentra",
  description: "Licentra is a modern license management platform built for developers. Generate, manage and validate software licenses with simplicity and security.",
  openGraph: {
    title: "Licentra",
    description: "Licentra is a modern license management platform built for developers. Generate, manage and validate software licenses with simplicity and security.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Licentra",
    description: "Licentra is a modern license management platform built for developers. Generate, manage and validate software licenses with simplicity and security.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Navbar />
          {children}
          <Toaster />
          <CookieConsentBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
