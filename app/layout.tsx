import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import Nav from '@/components/Nav'

const display = Outfit({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700', '800'] })
const body = Inter({ subsets: ['latin'], variable: '--font-body' })

export const metadata: Metadata = {
  title: 'Quiz Arena',
  description: 'Competições de conhecimento ao vivo, treino individual e ranking permanente',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  )
}
