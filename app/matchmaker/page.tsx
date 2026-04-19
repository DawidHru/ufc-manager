'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Fighter, Event, Division, TitleType, CardPosition } from '@/lib/database.types'
import { DIVISIONS } from '@/lib/database.types'
import { calculateFightScore, isFastTrack, determineScheduledRounds } from '@/lib/matchmaking'

interface MatchSuggestion {
  fighter1: Fighter
  fighter2: Fighter
  score: ReturnType<typeof calculateFightScore>
  isFastTrack: boolean
  rounds: number
}

function MatchmakerContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const eventIdParam = searchParams.get('event')

  const [events, setEvents] = useState<Event[]>([])
  const [fighters, setFighters] = useState<Fighter[]>([])
  const [rankings, setRankings] = useState<Record<string, Record<number, number>>>({})
  const [selectedEvent, setSelectedEvent] = useState<string>(eventIdParam ?? '')
  const [division, setDivision] = useState<Division>('Lightweight')
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  // Manual booking
  const [f1Id, setF1Id] = useState('')
  const [f2Id, setF2Id] = useState('')
  const [cardPos, setCardPos] = useState<CardPosition>('main_card')
  const [titleType, setTitleType] = useState<TitleType>('none')
  const [manualDiv, setManualDiv] = useState<Division>('Lightweight')
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    fetchBase()
  }, [])

  async function fetchBase() {
    const [{ data: ev }, { data: ft }, { data: rk }] = await Promise.all([
      supabase.from('events').select('*').eq('status', 'scheduled').order('event_date'),
      supabase.from('fighters').select('*').eq('status', 'active'),
      supabase.from('current_rankings').select('*'),
    ])
    setEvents(ev ?? [])
    setFighters(ft ?? [])

    // Build rank lookup: division -> fighter_id -> rank
    const rankMap: Record<string, Record<number, number>> = {}
    for (const r of rk ?? []) {
      if (!rankMap[r.division]) rankMap[r.division] = {}
      rankMap[r.division][r.fighter_id] = r.rank
    }
    setRankings(rankMap)
  }

  function getRank(fighterId: number, div: Division): number | null {
    return rankings[div]?.[fighterId] ?? null
  }

  function generateSuggestions() {
    setLoading(true)
    const divFighters = fighters.filter(f => f.primary_division === division || f.secondary_division === division)
    const today = new Date()
    const result: MatchSuggestion[] = []

    for (let i = 0; i < divFighters.length; i++) {
      for (let j = i + 1; j < divFighters.length; j++) {
        const f1 = divFighters[i]
        const f2 = divFighters[j]
        if (f1.available_date && new Date(f1.available_date) > today) continue
        if (f2.available_date && new Date(f2.available_date) > today) continue

        const f1Rank = getRank(f1.id, division)
        const f2Rank = getRank(f2.id, division)

        const score = calculateFightScore(
          f1, f2, f1Rank, f2Rank,
          { f1vsf2Count: 0, lastFightHype: null, lastFightDominance: null },
          false, 0, today
        )

        const ft1 = isFastTrack(f1) || isFastTrack(f2)
        const eventType = events.find(e => e.id === Number(selectedEvent))?.event_type ?? 'Fight Night'
        const rounds = determineScheduledRounds(false, false, 'main_card', eventType as any, f1, f2, f1Rank, f2Rank)

        result.push({ fighter1: f1, fighter2: f2, score, isFastTrack: ft1, rounds })
      }
    }

    result.sort((a, b) => b.score.total - a.score.total)
    setSuggestions(result.slice(0, 20))
    setLoading(false)
  }

  async function bookFight(f1: Fighter, f2: Fighter, div: Division, pos: CardPosition, tType: TitleType, rounds: number) {
    if (!selectedEvent) return alert('Select an event first')
    const { error } = await supabase.from('fights').insert({
      event_id: Number(selectedEvent),
      fighter1_id: f1.id,
      fighter2_id: f2.id,
      division: div,
      card_position: pos,
      title_type: tType,
      scheduled_rounds: rounds,
    })
    if (error) alert('Error: ' + error.message)
    else router.push(`/events/${selectedEvent}`)
  }

  async function bookManual() {
    if (!f1Id || !f2Id || !selectedEvent) return alert('Select both fighters and an event')
    if (f1Id === f2Id) return alert('Fighters must be different')
    setBooking(true)
    const f1 = fighters.find(f => f.id === Number(f1Id))!
    const f2 = fighters.find(f => f.id === Number(f2Id))!
    const eventType = events.find(e => e.id === Number(selectedEvent))?.event_type ?? 'Fight Night'
    const f1Rank = getRank(f1.id, manualDiv)
    const f2Rank = getRank(f2.id, manualDiv)
    const rounds = determineScheduledRounds(titleType === 'title', titleType === 'interim_title', cardPos, eventType as any, f1, f2, f1Rank, f2Rank)
    await bookFight(f1, f2, manualDiv, cardPos, titleType, rounds)
    setBooking(false)
  }

  const availableFighters = fighters.filter(f => !f.available_date || new Date(f.available_date) <= new Date())

  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Matchmaker</h1>

      {/* Event selector */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 20, marginBottom: 24,
      }}>
        <label style={labelStyle}>Target Event</label>
        <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={{ ...inputStyle, width: 400 }}>
          <option value="">Select event...</option>
          {events.map(e => (
            <option key={e.id} value={e.id}>
              {e.name} — {new Date(e.event_date).toLocaleDateString('pl-PL')} [{e.event_type}]
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Auto suggestions */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Auto Suggestions</h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <select value={division} onChange={e => setDivision(e.target.value as Division)} style={inputStyle}>
              {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={generateSuggestions} style={{
              background: 'var(--accent)', border: 'none', color: '#fff',
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              Generate
            </button>
          </div>

          {loading ? (
            <div style={{ color: 'var(--muted)', padding: 20 }}>Calculating...</div>
          ) : suggestions.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: 20 }}>
              Select a division and click Generate
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.slice(0, 10).map((s, i) => (
                <div key={i} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {s.fighter1.first_name} {s.fighter1.last_name}
                      <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
                      {s.fighter2.first_name} {s.fighter2.last_name}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {s.isFastTrack && (
                        <span style={{ fontSize: 10, color: '#f97316', fontWeight: 700, background: '#f9731622', padding: '2px 6px', borderRadius: 4 }}>FAST TRACK</span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{s.score.total}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    <span>Rank: {s.score.ranking}</span>
                    <span>Hype: {s.score.hype}</span>
                    <span>Fresh: {s.score.freshness}</span>
                    <span>Narr: {s.score.narrative}</span>
                    <span>{s.rounds}R</span>
                  </div>
                  <button
                    onClick={() => bookFight(s.fighter1, s.fighter2, division, 'main_card', 'none', s.rounds)}
                    disabled={!selectedEvent}
                    style={{
                      background: selectedEvent ? 'var(--surface2)' : 'var(--border)',
                      border: '1px solid var(--border)', color: selectedEvent ? 'var(--foreground)' : 'var(--muted)',
                      padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: selectedEvent ? 'pointer' : 'not-allowed',
                    }}>
                    Book this fight
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual booking */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Manual Booking</h2>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Division</label>
              <select value={manualDiv} onChange={e => setManualDiv(e.target.value as Division)} style={{ ...inputStyle, width: '100%' }}>
                {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fighter 1</label>
              <select value={f1Id} onChange={e => setF1Id(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select fighter...</option>
                {availableFighters.map(f => (
                  <option key={f.id} value={f.id}>{f.first_name} {f.last_name} ({f.wins}-{f.losses}) – {f.primary_division}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fighter 2</label>
              <select value={f2Id} onChange={e => setF2Id(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select fighter...</option>
                {availableFighters.filter(f => f.id !== Number(f1Id)).map(f => (
                  <option key={f.id} value={f.id}>{f.first_name} {f.last_name} ({f.wins}-{f.losses}) – {f.primary_division}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <button onClick={bookManual} disabled={booking || !selectedEvent} style={{
              background: 'var(--accent)', border: 'none', color: '#fff',
              padding: '11px 20px', borderRadius: 8, fontSize: 14, fontWeight: 700,
              cursor: booking || !selectedEvent ? 'not-allowed' : 'pointer',
              opacity: booking || !selectedEvent ? 0.6 : 1,
            }}>
              {booking ? 'Booking...' : 'Book Fight'}
            </button>
            {!selectedEvent && (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Select an event above first</p>
            )}
          </div>
        </div>
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
