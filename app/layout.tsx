import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'UFC Manager',
  description: 'UFC Manager Simulation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
