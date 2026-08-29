import type { Metadata, Viewport } from "next"
import { PwaRegister } from "@/components/PwaRegister"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Tall Karol CRM",
    template: "%s · Tall Karol CRM",
  },
  description: "Inquiry inbox and client portal for Tall Karol",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/clock-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/clock-180.png", sizes: "180x180", type: "image/png" }],
  },
  // Saved to a home screen, this opens straight onto the clock.
  appleWebApp: {
    capable: true,
    title: "TK Clock",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: "#006965",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
