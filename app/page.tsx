'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Event, Fighter } from '@/lib/database.types'

export default function Dashboard() {
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [topFighters, setTopFighters] = useState<Fighter[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, injured: 0, champions: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: events }, { data: fighters }] = await Promise.all([
      supabase.from('events').select('*').order('event_date', { ascending: true }),
      supabase.from('fighters').select('*').neq('status', 'released').neq('status', 'retired'),
    ])

    const allEvents = events ?? []
    const allFighters = fighters ?? []

    setUpcomingEvents(allEvents.filter(e => e.status === 'scheduled').slice(0, 3))
    setRecentEvents(allEvents.filter(e => e.status === 'completed').reverse().slice(0, 3))
    setTopFighters(allFighters.sort((a, b) => b.hype_score - a.hype_score).slice(0, 5))
    setStats({
      total: allFighters.length,
      active: allFighters.filter(f => f.status === 'active').length,
      injured: allFighters.filter(f => f.status === 'injured').length,
      champions: allFighters.filter(f => f.is_champion || f.is_interim_champion).length,
    })
    setLoading(false)
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>UFC Manager Simulation</p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading...</div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
            {[
              { label: 'Total Fighters', value: stats.total, color: 'var(--foreground)' },
              { label: 'Active', value: stats.active, color: 'var(--green)' },
              { label: 'Injured', value: stats.injured, color: '#f97316' },
              { label: 'Champions', value: stats.champions, color: 'var(--gold)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '18px 20px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <Section title="Upcoming Events" action={{ label: 'All Events', href: '/events' }}>
              {upcomingEvents.length === 0 ? <Empty text="No upcoming events" /> : upcomingEvents.map(ev => (
                <Link key={ev.id} href={`/events/${ev.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{ev.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{new Date(ev.event_date).toLocaleDateString('pl-PL')}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: ev.event_type === 'PPV' ? 'var(--accent)' : 'var(--surface2)',
                        color: ev.event_type === 'PPV' ? '#fff' : 'var(--muted)',
                      }}>
                        {ev.event_type === 'PPV' ? 'PPV' : 'FN'}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </Section>

            <Section title="Recent Events" action={{ label: 'All Events', href: '/events' }}>
              {recentEvents.length === 0 ? <Empty text="No completed events" /> : recentEvents.map(ev => (
                <Link key={ev.id} href={`/events/${ev.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{ev.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{new Date(ev.event_date).toLocaleDateString('pl-PL')} · Completed</div>
                  </div>
                </Link>
              ))}
            </Section>

            <Section title="Top Hype Fighters" action={{ label: 'Full Roster', href: '/roster' }}>
              {topFighters.length === 0 ? <Empty text="No fighters yet" /> : topFighters.map((f, i) => (
                <Link key={f.id} href={`/roster/${f.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < topFighters.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ width: 20, textAlign: 'center', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{f.first_name} {f.last_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.primary_division}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(f.hype_score)}</div>
                  </div>
                </Link>
              ))}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: { label: string; href: string } }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h2>
        {action && <Link href={action.href} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>{action.label} →</Link>}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{text}</div>
}
