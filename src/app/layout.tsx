import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/error-boundary";

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BOKA — Domowy Asystent AI",
  description: "BOKA — inteligentny asystent domowy. Rozpoznaje mowę po polsku, szuka w internecie, pamięta każdego domownika, buduje pamięć o rodzinie.",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/boka-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/boka-icon-512.png',
  },
  appleWebApp: {
    capable: true,
    title: 'BOKA',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeWhatlor: '#00f5d4',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning className="dark">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="desktop-web-app-capable" content="yes" />
      </head>
      <body className={`${mono.variable} antialiased`}>
        <ErrorBoundary tabName="BOKA OS">
          {children}
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
