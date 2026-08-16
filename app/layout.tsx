import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "CarbonAI-Private",
  description: "Your private AI assistant",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CarbonAI-Private",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d26" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-white dark:bg-carbon-950 text-carbon-900 dark:text-carbon-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}