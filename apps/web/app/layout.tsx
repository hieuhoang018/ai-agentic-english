import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SerwistProvider } from "@serwist/next/react";
import ClerkThemeProvider from "./components/ClerkThemeProvider";
import InstallPwaPrompt from "./components/InstallPwaPrompt";
import OfflineSyncListener from "./components/OfflineSyncListener";
import PushNotificationPrompt from "./components/PushNotificationPrompt";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "English Academy - Wise Mentor AI",
  description: "English application for learning English with AI-powered mentor.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "English Academy",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f62fe" },
    { media: "(prefers-color-scheme: dark)", color: "#2f3133" },
  ],
  colorScheme: "light dark",
};

// Runs before hydration so the `dark` class is correct on first paint (no flash of the
// wrong theme). Duplicates lib/theme.ts's resolution logic in plain JS since it can't import
// an ES module here; THEME_STORAGE_KEY is imported so the storage key itself can't drift.
const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-background dark:bg-inverse-surface text-on-background dark:text-inverse-on-surface font-sans min-h-screen flex">
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
          <ClerkThemeProvider>
            <main className="flex-1">{children}</main>
            <InstallPwaPrompt />
            <PushNotificationPrompt />
            <OfflineSyncListener />
          </ClerkThemeProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
