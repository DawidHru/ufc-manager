'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard',  label: 'Dashboard',   icon: '⬛' },
  { href: '/roster',     label: 'Roster',       icon: '👊' },
  { href: '/rankings',   label: 'Rankings',     icon: '🏆' },
  { href: '/events',     label: 'Events',       icon: '📅' },
  { href: '/matchmaker', label: 'Matchmaker',   icon: '⚔️' },
  { href: '/commands',   label: 'Commands',     icon: '💻' },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const [simName, setSimName] = useState<string | null>(null)

  useEffect(() => {
    const simId = localStorage.getItem('simId')
    if (!simId) return
    supabase
      .from('simulation_config')
      .select('name, sim_date')
      .eq('id', simId)
      .single()
      .then(({ data }) => {
        if (data) setSimName(data.name ?? `Symulacja #${simId}`)
      })
  }, [])

  function switchSim() {
    localStorage.removeItem('simId')
    router.push('/')
  }

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
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.15em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
          UFC
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
          MANAGER
        </div>
        {simName && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {simName}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {NAV.map(({ href, label, icon }) => {
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
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
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <button onClick={switchSim} style={{
          width: '100%', background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 12px', color: 'var(--muted)',
          cursor: 'pointer', fontSize: 12, textAlign: 'left',
        }}>
          ← Zmień symulację
        </button>
      </div>
    </aside>
  )
}
