'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/database.types'
import { getSimId } from '@/lib/sim'

const VENUES: { name: string; city: string; ppv: boolean }[] = [
  { name: 'T-Mobile Arena',       city: 'Las Vegas, NV',        ppv: true  },
  { name: 'MGM Grand Garden Arena', city: 'Las Vegas, NV',      ppv: true  },
  { name: 'Honda Center',         city: 'Anaheim, CA',           ppv: false },
  { name: 'O2 Arena',             city: 'London, UK',            ppv: true  },
  { name: 'Prudential Center',    city: 'Newark, NJ',            ppv: false },
  { name: 'Toyota Center',        city: 'Houston, TX',           ppv: false },
  { name: 'Madison Square Garden', city: 'New York, NY',         ppv: true  },
  { name: 'Scotiabank Arena',     city: 'Toronto, ON',           ppv: true  },
  { name: 'Bell Centre',          city: 'Montreal, QC',          ppv: false },
  { name: 'Jeunesse Arena',       city: 'Rio de Janeiro, BR',    ppv: false },
  { name: 'United Center',        city: 'Chicago, IL',           ppv: true  },
  { name: 'Saitama Super Arena',  city: 'Saitama, JP',           ppv: false },
]

type GenEvent = {
  name: string
  event_date: string
  event_type: 'PPV' | 'Fight Night'
  location: string
  ppv_number?: number
}

function nextSaturday(from: Date): Date {
  const d = new Date(from)
  const day = d.getDay()
  const diff = day === 6 ? 7 : (6 - day)
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateSchedule(startDate: Date, weeksAhead: number, startPpvNum: number): GenEvent[] {
  const events: GenEvent[] = []
  const ppvVenues = VENUES.filter(v => v.ppv)
  let ppvNum = startPpvNum
  // Cycle: 8 weeks (56 days) between PPVs
  // PPV → FN week 3 (day 21) → FN week 5 (day 35) → PPV week 8 (day 56)
  let ppvDate = nextSaturday(startDate)
  const totalDays = weeksAhead * 7

  while (true) {
    const fn1Date = addDays(ppvDate, 21)
    const fn2Date = addDays(ppvDate, 35)
    const nextPpvDate = addDays(ppvDate, 56)

    if ((ppvDate.getTime() - startDate.getTime()) / 86400000 > totalDays) break

    // PPV
    const ppvVenue = pick(ppvVenues)
    events.push({
      name: `UFC ${ppvNum}`,
      event_date: fmtDate(ppvDate),
      event_type: 'PPV',
      location: `${ppvVenue.name}, ${ppvVenue.city}`,
      ppv_number: ppvNum,
    })
    ppvNum++

    // Fight Night 1 (week 3)
    if ((fn1Date.getTime() - startDate.getTime()) / 86400000 <= totalDays) {
      const v = pick(VENUES)
      events.push({
        name: `UFC Fight Night: ${v.city.split(',')[0]}`,
        event_date: fmtDate(fn1Date),
        event_type: 'Fight Night',
        location: `${v.name}, ${v.city}`,
      })
    }

    // Fight Night 2 (week 5)
    if ((fn2Date.getTime() - startDate.getTime()) / 86400000 <= totalDays) {
      const v = pick(VENUES)
      events.push({
        name: `UFC Fight Night: ${v.city.split(',')[0]}`,
        event_date: fmtDate(fn2Date),
        event_type: 'Fight Night',
        location: `${v.name}, ${v.city}`,
      })
    }

    ppvDate = nextPpvDate
  }

  return events.sort((a, b) => a.event_date.localeCompare(b.event_date))
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming')

  // Generator state
  const [showGen, setShowGen] = useState(false)
  const [genStartDate, setGenStartDate] = useState('')
  const [genWeeks, setGenWeeks] = useState(16)
  const [genPpvNum, setGenPpvNum] = useState(1)
  const [preview, setPreview] = useState<GenEvent[] | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setLoading(true)
    const simId = getSimId()
    const query = supabase.from('events').select('*').order('event_date', { ascending: true })
    if (simId) query.eq('sim_id', simId)
    const { data } = await query
    const evs = data ?? []
    setEvents(evs)
    setLoading(false)

    // Set generator defaults based on existing events
    const lastEvent = evs.filter(e => e.status === 'scheduled').at(-1)
    const lastPpv = [...evs].filter(e => e.event_type === 'PPV' && e.ppv_number).sort((a, b) => (b.ppv_number ?? 0) - (a.ppv_number ?? 0))[0]

    if (lastEvent) {
      const d = addDays(new Date(lastEvent.event_date), 7)
      setGenStartDate(fmtDate(d))
    } else {
      // Try to get sim_date
      const simId = typeof window !== 'undefined' ? localStorage.getItem('simId') : null
      if (simId) {
        const { data: sim } = await supabase.from('simulation_config').select('sim_date').eq('id', simId).single()
        if (sim) setGenStartDate(sim.sim_date)
      }
      if (!genStartDate) setGenStartDate(fmtDate(new Date()))
    }

    setGenPpvNum(lastPpv ? (lastPpv.ppv_number ?? 0) + 1 : 1)
  }

  function handlePreview() {
    if (!genStartDate) return
    const result = generateSchedule(new Date(genStartDate), genWeeks, genPpvNum)
    setPreview(result)
  }

  async function handleCreate() {
    if (!preview) return
    setCreating(true)
    const simId = getSimId()
    const { error } = await supabase.from('events').insert(
      preview.map(e => ({
        sim_id: simId,
        name: e.name,
        event_date: e.event_date,
        event_type: e.event_type,
        location: e.location,
        ppv_number: e.ppv_number ?? null,
        status: 'scheduled',
      }))
    )
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setShowGen(false)
      setPreview(null)
      fetchEvents()
    }
    setCreating(false)
  }

  const upcoming = events.filter(e => e.status === 'scheduled')
  const completed = events.filter(e => e.status === 'completed')
  const shown = tab === 'upcoming' ? upcoming : completed

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Events</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setShowGen(g => !g); setPreview(null) }} style={{
            background: showGen ? 'var(--surface2)' : 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--foreground)',
            padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Auto Generate
          </button>
          <Link href="/events/create" style={{
            background: 'var(--accent)', color: '#fff', padding: '10px 20px',
            borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>
            + Create Event
          </Link>
        </div>
      </div>

      {/* Auto Generator Panel */}
      {showGen && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>Auto Generate Schedule</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Start from
              </label>
              <input type="date" value={genStartDate} onChange={e => { setGenStartDate(e.target.value); setPreview(null) }} style={{
                width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14, boxSizing: 'border-box',
              }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Weeks ahead
              </label>
              <select value={genWeeks} onChange={e => { setGenWeeks(Number(e.target.value)); setPreview(null) }} style={{
                width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14,
              }}>
                {[8, 16, 24, 32, 48].map(w => <option key={w} value={w}>{w} weeks (~{Math.round(w / 4.3)} months)</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Starting PPV #
              </label>
              <input type="number" value={genPpvNum} onChange={e => { setGenPpvNum(Number(e.target.value)); setPreview(null) }} min={1} style={{
                width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14, boxSizing: 'border-box',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: preview ? 20 : 0 }}>
            <button onClick={handlePreview} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 20px', color: 'var(--foreground)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Preview
            </button>
            {preview && (
              <button onClick={handleCreate} disabled={creating} style={{
                background: 'var(--accent)', border: 'none', borderRadius: 8,
                padding: '10px 24px', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1,
              }}>
                {creating ? 'Creating...' : `Create all ${preview.length} events`}
              </button>
            )}
          </div>

          {preview && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                {preview.length} events will be created · PPV every 4 weeks, 2 Fight Nights between
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {preview.map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                      background: e.event_type === 'PPV' ? 'var(--accent)' : 'transparent',
                      border: e.event_type === 'PPV' ? 'none' : '1px solid var(--border)',
                      color: e.event_type === 'PPV' ? '#fff' : 'var(--muted)',
                    }}>
                      {e.event_type === 'PPV' ? 'PPV' : 'FN'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{e.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                      {new Date(e.event_date).toLocaleDateString('pl-PL', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, maxWidth: 180, textAlign: 'right' }}>{e.location}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['upcoming', 'completed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 18px', borderRadius: 6, border: 'none', fontSize: 13,
            fontWeight: tab === t ? 700 : 400, cursor: 'pointer',
            background: tab === t ? 'var(--surface2)' : 'transparent',
            color: tab === t ? 'var(--foreground)' : 'var(--muted)',
          }}>
            {t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Completed (${completed.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40 }}>Loading...</div>
      ) : shown.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 48, textAlign: 'center', color: 'var(--muted)',
        }}>
          No {tab} events
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map(event => (
            <Link key={event.id} href={`/events/${event.id}`} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '18px 24px', textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.08em',
                  background: event.event_type === 'PPV' ? 'var(--accent)' : 'var(--surface2)',
                  color: event.event_type === 'PPV' ? '#fff' : 'var(--muted)',
                }}>
                  {event.event_type === 'PPV' ? `PPV ${event.ppv_number ? `#${event.ppv_number}` : ''}` : 'FIGHT NIGHT'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)' }}>{event.name}</div>
                  {event.location && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{event.location}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
                  {new Date(event.event_date).toLocaleDateString('pl-PL', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {event.status === 'completed' ? 'Completed' : 'Scheduled'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
