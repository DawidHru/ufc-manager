'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',           label: 'Dashboard',   icon: '⬛' },
  { href: '/roster',     label: 'Roster',       icon: '👊' },
  { href: '/rankings',   label: 'Rankings',     icon: '🏆' },
  { href: '/events',     label: 'Events',       icon: '📅' },
  { href: '/matchmaker', label: 'Matchmaker',   icon: '⚔️' },
  { href: '/commands',   label: 'Commands',     icon: '💻' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.15em',
          color: 'var(--muted)',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          UFC
        </div>
        <div style={{
          fontSize: 20,
          fontWeight: 800,
          color: 'var(--accent)',
          letterSpacing: '-0.02em',
        }}>
          MANAGER
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {NAV.map(({ href, label, icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href))
          return (
            <Link key={href} href={href} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--foreground)' : 'var(--muted)',
              background: active ? 'var(--surface2)' : 'transparent',
              borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--muted)',
      }}>
        UFC Manager v0.1
      </div>
    </aside>
  )
}
