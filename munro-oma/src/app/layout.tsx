import type { Metadata } from "next"
import { Open_Sans } from "next/font/google"
import "./globals.css"

// Brand Guide p.10: Open Sans is the only permitted font.
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" })

export const metadata: Metadata = { title: "OMA Performance Systems" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${openSans.variable} font-sans`}>{children}</body>
    </html>
  )
}
