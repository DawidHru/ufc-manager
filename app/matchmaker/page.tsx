'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Fighter, Event, Division, TitleType, CardPosition } from '@/lib/database.types'
import { DIVISIONS } from '@/lib/database.types'
import { determineScheduledRounds } from '@/lib/matchmaking'

function MatchmakerContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const eventIdParam = searchParams.get('event')

  const [events, setEvents] = useState<Event[]>([])
  const [fighters, setFighters] = useState<Fighter[]>([])
  const [rankings, setRankings] = useState<Record<string, Record<number, number>>>({})
  const [selectedEvent, setSelectedEvent] = useState<string>(eventIdParam ?? '')
  const [bookedFighterIds, setBookedFighterIds] = useState<Set<number>>(new Set())

  const [f1Id, setF1Id] = useState(searchParams.get('f1') ?? '')
  const [f2Id, setF2Id] = useState(searchParams.get('f2') ?? '')
  const [cardPos, setCardPos] = useState<CardPosition>('main_card')
  const [titleType, setTitleType] = useState<TitleType>('none')
  const [manualDiv, setManualDiv] = useState<Division>('Lightweight')
  const [booking, setBooking] = useState(false)

  useEffect(() => { fetchBase() }, [])

  // Auto-set division when both fighters selected
  useEffect(() => {
    if (f1Id) {
      const f = fighters.find(fi => fi.id === Number(f1Id))
      if (f) setManualDiv(f.primary_division)
    }
  }, [f1Id, fighters])

  async function fetchBase() {
    const [{ data: ev }, { data: ft }, { data: rk }] = await Promise.all([
      supabase.from('events').select('*').eq('status', 'scheduled').order('event_date'),
      supabase.from('fighters').select('*').eq('status', 'active'),
      supabase.from('current_rankings').select('*'),
    ])
    const evList = ev ?? []
    setEvents(evList)
    setFighters(ft ?? [])
    const rankMap: Record<string, Record<number, number>> = {}
    for (const r of rk ?? []) {
      if (!rankMap[r.division]) rankMap[r.division] = {}
      rankMap[r.division][r.fighter_id] = r.rank
    }
    setRankings(rankMap)

    // Fighters already booked in any scheduled pending fight
    const scheduledIds = evList.map(e => e.id)
    if (scheduledIds.length > 0) {
      const { data: pending } = await supabase
        .from('fights').select('fighter1_id, fighter2_id')
        .in('event_id', scheduledIds).is('result_method', null)
      const ids = new Set<number>()
      for (const f of pending ?? []) { ids.add(f.fighter1_id); ids.add(f.fighter2_id) }
      setBookedFighterIds(ids)
    }
  }

  function getRank(fighterId: number, div: Division): number | null {
    return rankings[div]?.[fighterId] ?? null
  }

  async function bookManual() {
    if (!f1Id || !f2Id || !selectedEvent) return alert('Select both fighters and an event')
    if (f1Id === f2Id) return alert('Fighters must be different')
    setBooking(true)
    const f1 = fighters.find(f => f.id === Number(f1Id))!
    const f2 = fighters.find(f => f.id === Number(f2Id))!
    const ev = events.find(e => e.id === Number(selectedEvent))
    const eventType = ev?.event_type ?? 'Fight Night'

    // Validate availability against event date
    const eventDate = ev ? new Date(ev.event_date) : new Date()
    if (f1.available_date && new Date(f1.available_date) > eventDate) {
      setBooking(false)
      return alert(`${f1.first_name} ${f1.last_name} is not available until ${new Date(f1.available_date).toLocaleDateString('pl-PL')} — after this event.`)
    }
    if (f2.available_date && new Date(f2.available_date) > eventDate) {
      setBooking(false)
      return alert(`${f2.first_name} ${f2.last_name} is not available until ${new Date(f2.available_date).toLocaleDateString('pl-PL')} — after this event.`)
    }

    const f1Rank = getRank(f1.id, manualDiv)
    const f2Rank = getRank(f2.id, manualDiv)
    const rounds = determineScheduledRounds(titleType === 'title', titleType === 'interim_title', cardPos, eventType as any, f1, f2, f1Rank, f2Rank)
    const { error } = await supabase.from('fights').insert({
      event_id: Number(selectedEvent),
      fighter1_id: f1.id,
      fighter2_id: f2.id,
      division: manualDiv,
      card_position: cardPos,
      title_type: titleType,
      scheduled_rounds: rounds,
    })
    if (error) alert('Error: ' + error.message)
    else router.push(`/events/${selectedEvent}`)
    setBooking(false)
  }

  // Filter by: not booked in any upcoming fight, available by selected event date (or today)
  const selectedEventDate = selectedEvent
    ? events.find(e => e.id === Number(selectedEvent))?.event_date
    : null
  const cutoff = selectedEventDate ? new Date(selectedEventDate) : new Date()

  const availableFighters = fighters.filter(f => {
    if (bookedFighterIds.has(f.id)) return false
    if (f.available_date && new Date(f.available_date) > cutoff) return false
    return true
  })

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Matchmaker</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
        Manually book a fight. For suggestions, open a fighter's profile.
      </p>

      {/* Event selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Target Event</label>
        <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
          <option value="">Select event...</option>
          {events.map(e => (
            <option key={e.id} value={e.id}>
              {e.name} — {new Date(e.event_date).toLocaleDateString('pl-PL')} [{e.event_type}]
            </option>
          ))}
        </select>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Division</label>
          <select value={manualDiv} onChange={e => setManualDiv(e.target.value as Division)} style={{ ...inputStyle, width: '100%' }}>
            {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Fighter 1</label>
            <select value={f1Id} onChange={e => setF1Id(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              <option value="">Select...</option>
              {availableFighters.map(f => (
                <option key={f.id} value={f.id}>{f.first_name} {f.last_name} ({f.wins}-{f.losses})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Fighter 2</label>
            <select value={f2Id} onChange={e => setF2Id(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              <option value="">Select...</option>
              {availableFighters.filter(f => f.id !== Number(f1Id)).map(f => (
                <option key={f.id} value={f.id}>{f.first_name} {f.last_name} ({f.wins}-{f.losses})</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Card Position</label>
            <select value={cardPos} onChange={e => setCardPos(e.target.value as CardPosition)} style={{ ...inputStyle, width: '100%' }}>
              <option value="main_event">Main Event</option>
              <option value="co_main">Co-Main Event</option>
              <option value="main_card">Main Card</option>
              <option value="prelims">Prelims</option>
              <option value="early_prelims">Early Prelims</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Title Fight</label>
            <select value={titleType} onChange={e => setTitleType(e.target.value as TitleType)} style={{ ...inputStyle, width: '100%' }}>
              <option value="none">No</option>
              <option value="title">Title Fight</option>
              <option value="interim_title">Interim Title</option>
              <option value="contender">Contender</option>
            </select>
          </div>
        </div>

        <button onClick={bookManual} disabled={booking || !selectedEvent || !f1Id || !f2Id} style={{
          background: 'var(--accent)', border: 'none', color: '#fff',
          padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 700,
          cursor: (booking || !selectedEvent || !f1Id || !f2Id) ? 'not-allowed' : 'pointer',
          opacity: (booking || !selectedEvent || !f1Id || !f2Id) ? 0.5 : 1,
        }}>
          {booking ? 'Booking...' : 'Book Fight'}
        </button>
        {!selectedEvent && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Select an event above first</p>}
      </div>
    </div>
  )
}

export default function MatchmakerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div>}>
      <MatchmakerContent />
    </Suspense>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', display: 'block',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em',
}
const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 12px', color: 'var(--foreground)', fontSize: 13,
}
