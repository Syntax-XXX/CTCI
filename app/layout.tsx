import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CTCI',
  description: 'Custom Twitch Chat Interface for OBS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
