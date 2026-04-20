'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Event, Fighter, Fight } from '@/lib/database.types'
import { getSimId } from '@/lib/sim'

interface CurrentEventData {
  event: Event
  fights: Fight[]
  allDone: boolean
  fightCount: number
  doneCount: number
}

export default function Dashboard() {
  const router = useRouter()
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [topFighters, setTopFighters] = useState<Fighter[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, injured: 0, champions: 0 })
  const [current, setCurrent] = useState<CurrentEventData | null>(null)
  const [simDate, setSimDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const simId = getSimId()

    // Get sim date
    if (simId) {
      const { data: sim } = await supabase.from('simulation_config').select('sim_date').eq('id', simId).single()
      if (sim) setSimDate(sim.sim_date)
    }
    const [{ data: events }, { data: fighters }] = await Promise.all([
      simId
        ? supabase.from('events').select('*').eq('sim_id', simId).order('event_date', { ascending: true })
        : supabase.from('events').select('*').order('event_date', { ascending: true }),
      simId
        ? supabase.from('fighters').select('*').eq('sim_id', simId).neq('status', 'released').neq('status', 'retired')
        : supabase.from('fighters').select('*').neq('status', 'released').neq('status', 'retired'),
    ])

    const allEvents = events ?? []
    const allFighters = fighters ?? []

    // Current event = earliest scheduled
    const nextEvent = allEvents.find(e => e.status === 'scheduled')
    if (nextEvent) {
      const { data: fights } = await supabase
        .from('fights')
        .select('*')
        .eq('event_id', nextEvent.id)
      const fightList = fights ?? []
      const done = fightList.filter(f => f.result_method !== null).length
      setCurrent({
        event: nextEvent,
        fights: fightList,
        allDone: fightList.length > 0 && done === fightList.length,
        fightCount: fightList.length,
        doneCount: done,
      })
    } else {
      setCurrent(null)
    }

    setUpcomingEvents(allEvents.filter(e => e.status === 'scheduled').slice(1, 4))
    setRecentEvents(allEvents.filter(e => e.status === 'completed').reverse().slice(0, 3))
    setTopFighters([...allFighters].sort((a, b) => b.hype_score - a.hype_score).slice(0, 5))
    setStats({
      total: allFighters.length,
      active: allFighters.filter(f => f.status === 'active').length,
      injured: allFighters.filter(f => f.status === 'injured').length,
      champions: allFighters.filter(f => f.is_champion || f.is_interim_champion).length,
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function completeEvent() {
    if (!current) return
    setCompleting(true)
    await supabase.from('events').update({ status: 'completed' }).eq('id', current.event.id)

    // Advance sim_date to event date
    const simId = localStorage.getItem('simId')
    if (simId) {
      await supabase.from('simulation_config')
        .update({ sim_date: current.event.event_date })
        .eq('id', simId)
    }

    await fetchAll()
    setCompleting(false)
  }

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Dashboard</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>UFC Manager Simulation</p>
        </div>
        {simDate && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Simulation Date</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>
              {new Date(simDate).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading...</div>
      ) : (
        <>
          {/* ── Current Event Card ── */}
          {current ? (
            <div style={{
              background: current.allDone
                ? 'linear-gradient(135deg, #22c55e18, #22c55e05)'
                : 'linear-gradient(135deg, var(--accent)18, var(--accent)05)',
              border: `2px solid ${current.allDone ? 'var(--green)' : 'var(--accent)'}`,
              borderRadius: 16, padding: '24px 28px', marginBottom: 28,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: current.allDone ? 'var(--green)' : 'var(--accent)', textTransform: 'uppercase' }}>
                      {current.allDone ? '✓ Ready to Complete' : '▶ Current Event'}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: current.event.event_type === 'PPV' ? 'var(--accent)' : 'var(--surface2)',
                      color: current.event.event_type === 'PPV' ? '#fff' : 'var(--muted)',
                    }}>
                      {current.event.event_type === 'PPV' ? `PPV${current.event.ppv_number ? ` #${current.event.ppv_number}` : ''}` : 'FIGHT NIGHT'}
                    </span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{current.event.name}</div>
                  {current.event.location && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{current.event.location}</div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {new Date(current.event.event_date).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                  {/* Fight progress */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fights</div>
                    {current.fightCount === 0 ? (
                      <div style={{ fontSize: 13, color: '#f97316', fontWeight: 600 }}>No fights booked yet</div>
                    ) : (
                      <div style={{ fontSize: 20, fontWeight: 800 }}>
                        <span style={{ color: current.allDone ? 'var(--green)' : 'var(--foreground)' }}>{current.doneCount}</span>
                        <span style={{ color: 'var(--muted)', fontWeight: 400 }}> / {current.fightCount}</span>
                      </div>
                    )}
                    {current.fightCount > 0 && !current.allDone && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {current.fightCount - current.doneCount} result{current.fightCount - current.doneCount !== 1 ? 's' : ''} missing
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={`/events/${current.event.id}`} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--foreground)', padding: '9px 16px', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    }}>
                      Open Event →
                    </Link>
                    {current.allDone && (
                      <button onClick={completeEvent} disabled={completing} style={{
                        background: 'var(--green)', border: 'none', color: '#fff',
                        padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.7 : 1,
                      }}>
                        {completing ? 'Completing...' : 'Complete Event ✓'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, padding: '24px 28px', marginBottom: 28,
              textAlign: 'center', color: 'var(--muted)',
            }}>
              No upcoming events scheduled.{' '}
              <Link href="/events" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Generate schedule →
              </Link>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
            {[
              { label: 'Total Fighters', value: stats.total, color: 'var(--foreground)' },
              { label: 'Active', value: stats.active, color: 'var(--green)' },
              { label: 'Injured', value: stats.injured, color: '#f97316' },
              { label: 'Champions', value: stats.champions, color: 'var(--gold)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Upcoming + Recent + Top Fighters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <Section title="Next Events" action={{ label: 'All Events', href: '/events' }}>
              {upcomingEvents.length === 0 ? <Empty text="No more scheduled events" /> : upcomingEvents.map(ev => (
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
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {new Date(ev.event_date).toLocaleDateString('pl-PL')} · Completed
                    </div>
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
