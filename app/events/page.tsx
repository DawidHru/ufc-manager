'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/database.types'

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming')

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
    setEvents(data ?? [])
    setLoading(false)
  }

  const upcoming = events.filter(e => e.status === 'scheduled')
  const completed = events.filter(e => e.status === 'completed')
  const shown = tab === 'upcoming' ? upcoming : completed

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Events</h1>
        <Link href="/events/create" style={{
          background: 'var(--accent)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none',
        }}>
          + Create Event
        </Link>
      </div>

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
              transition: 'border-color 0.15s',
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
