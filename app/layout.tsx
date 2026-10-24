import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'Quiz Arena', description: 'Competições de conhecimento em tempo real' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-950 text-white antialiased">{children}</body>
    </html>
  )
}
