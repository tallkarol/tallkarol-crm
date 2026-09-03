import type { Metadata, Viewport } from "next"
import { Inter, Inter_Tight, Plus_Jakarta_Sans } from "next/font/google"
import { PwaRegister } from "@/components/PwaRegister"
import "./globals.css"

/* The site's own faces: Inter Tight for headings and big numbers, Plus
   Jakarta Sans for UI labels, Inter for running text. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Tall Karol CRM",
    template: "%s · Tall Karol CRM",
  },
  description: "Inquiry inbox and client portal for Tall Karol",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/tk-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/tk-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/tk-180.png", sizes: "180x180", type: "image/png" }],
  },
  // Saved to a home screen, this opens straight onto the clock.
  appleWebApp: {
    capable: true,
    title: "TallKarol",
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
    /* Light by default so the portal and login never go dark; the admin
       layout's boot script overrides this with the signed-in user's choice. */
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} ${interTight.variable} ${jakarta.variable}`}
    >
      <body className="min-h-screen font-sans">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
