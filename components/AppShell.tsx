'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  if (path === '/') {
    return <>{children}</>
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </>
  )
}
