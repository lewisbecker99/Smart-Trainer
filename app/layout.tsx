import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Trainer",
  description: "Your personal coach, powered by Strava, WHOOP and Claude.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Trainer", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Nav />
        <RegisterSW />
      </body>
    </html>
  );
}
