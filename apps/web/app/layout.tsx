import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <script
          id="tailwind-config"
          dangerouslySetInnerHTML={{
            __html: `
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "surface-container-low": "#f1f4f6",
                        "inverse-surface": "#2d3133",
                        "secondary-container": "#25fea8",
                        "on-secondary-fixed": "#002111",
                        "tertiary-fixed": "#e9ddff",
                        "surface-dim": "#d7dadc",
                        "on-secondary": "#ffffff",
                        "on-error": "#ffffff",
                        "surface-bright": "#f7fafc",
                        "surface-container-highest": "#e0e3e5",
                        "on-error-container": "#93000a",
                        "on-tertiary-container": "#f9f1ff",
                        "error": "#ba1a1a",
                        "surface-tint": "#0052dd",
                        "primary-fixed-dim": "#b4c5ff",
                        "on-surface": "#181c1e",
                        "on-primary": "#ffffff",
                        "surface-container-high": "#e5e9eb",
                        "surface-variant": "#e0e3e5",
                        "on-secondary-container": "#007147",
                        "on-primary-fixed-variant": "#003da9",
                        "tertiary-container": "#8243ff",
                        "primary-fixed": "#dbe1ff",
                        "surface-container-lowest": "#ffffff",
                        "tertiary": "#6a00f2",
                        "inverse-primary": "#b4c5ff",
                        "secondary-fixed-dim": "#00e293",
                        "on-background": "#181c1e",
                        "tertiary-fixed-dim": "#d1bcff",
                        "primary": "#0f62fe",
                        "secondary-fixed": "#50ffaf",
                        "on-primary-container": "#f3f3ff",
                        "secondary": "#006c44",
                        "outline": "#737687",
                        "on-tertiary-fixed-variant": "#5700c9",
                        "on-surface-variant": "#424656",
                        "on-tertiary": "#ffffff",
                        "on-secondary-fixed-variant": "#005232",
                        "inverse-on-surface": "#eef1f3",
                        "outline-variant": "#c3c6d8",
                        "surface": "#f7fafc",
                        "primary-container": "#0f62fe",
                        "surface-container": "#ebeef0",
                        "on-tertiary-fixed": "#23005b",
                        "background": "#f7fafc",
                        "error-container": "#ffdad6",
                        "on-primary-fixed": "#00174c"
                    },
                    spacing: {
                        "base": "8px",
                        "stack-sm": "8px",
                        "stack-md": "16px",
                        "stack-lg": "32px",
                        "gutter": "16px",
                        "container-margin": "24px",
                        "card-padding": "20px"
                    },
                    fontFamily: {
                        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                    }
                }
            }
        }
    `,
          }}
        />
      </head>
      <body className="bg-background dark:bg-inverse-surface text-on-background dark:text-inverse-on-surface font-sans min-h-screen flex">
        <ClerkProvider>
          <main className="flex-1">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
