import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Rare Beauty Chat',
  description: 'Chat with Rare Beauty AI assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="stylesheet" href="/css/github-markdown.css" />
      </head>
      <body className={`${inter.className} bg-white text-black`}>{children}</body>
    </html>
  )
}
