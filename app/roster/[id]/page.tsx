'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Fighter, Fight, Event, CardPosition, TitleType } from '@/lib/database.types'
import { calculateFightScore, isFastTrack, determineScheduledRounds } from '@/lib/matchmaking'

interface FightWithEvent extends Fight {
  event?: Event
  fighter1?: Fighter
  fighter2?: Fighter
}

interface Suggestion {
  opponent: Fighter
  score: number
  oppRank: number | null
  rounds: number
  isFastTrack: boolean
}

type BookingState = {
  opponentId: number
  mode: 'event' | 'queue' | null
  eventId: string
  cardPos: CardPosition
  titleType: TitleType
  saving: boolean
}

export default function FighterProfile() {
  const { id } = useParams()
  const router = useRouter()
  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [fights, setFights] = useState<FightWithEvent[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<BookingState>({
    opponentId: 0, mode: null, eventId: '', cardPos: 'main_card', titleType: 'none', saving: false,
  })

  useEffect(() => {
    if (id) fetchData(Number(id))
  }, [id])

  async function fetchData(fighterId: number) {
    setLoading(true)
    const [{ data: f }, { data: fts }, { data: ev }, { data: allFighters }, { data: rankings }] = await Promise.all([
      supabase.from('fighters').select('*').eq('id', fighterId).single(),
      supabase.from('fights')
        .select('*, events(*), fighter1:fighters!fighter1_id(*), fighter2:fighters!fighter2_id(*)')
        .or(`fighter1_id.eq.${fighterId},fighter2_id.eq.${fighterId}`)
        .not('result_method', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('status', 'scheduled').order('event_date'),
      supabase.from('fighters').select('*').eq('status', 'active').neq('id', fighterId),
      supabase.from('current_rankings').select('*'),
    ])

    setFighter(f)
    setFights(fts ?? [])
    setEvents(ev ?? [])

    if (f && allFighters) {
      // Get fighters already booked in upcoming scheduled fights
      const scheduledIds = (ev ?? []).map(e => e.id)
      let bookedIds = new Set<number>()
      if (scheduledIds.length > 0) {
        const { data: pending } = await supabase
          .from('fights').select('fighter1_id, fighter2_id')
          .in('event_id', scheduledIds).is('result_method', null)
        for (const fight of pending ?? []) {
          bookedIds.add(fight.fighter1_id)
          bookedIds.add(fight.fighter2_id)
        }
      }

      const rankMap: Record<string, Record<number, number>> = {}
      for (const r of rankings ?? []) {
        if (!rankMap[r.division]) rankMap[r.division] = {}
        rankMap[r.division][r.fighter_id] = r.rank
      }

      const myRank = rankMap[f.primary_division]?.[f.id] ?? null
      const today = new Date()

      // Filter: same division, available today, not already booked
      const candidates = allFighters.filter(opp => {
        if (bookedIds.has(opp.id)) return false
        if (opp.available_date && new Date(opp.available_date) > today) return false
        return opp.primary_division === f.primary_division || opp.secondary_division === f.primary_division
      })

      // Score each candidate
      const scored = candidates.map(opp => {
        const oppRank = rankMap[f.primary_division]?.[opp.id] ?? null
        const score = calculateFightScore(
          f, opp, myRank, oppRank,
          { f1vsf2Count: 0, lastFightHype: null, lastFightDominance: null },
          false, 0, today
        )
        const rounds = determineScheduledRounds(false, false, 'main_card', 'Fight Night', f, opp, myRank, oppRank)
        return {
          opponent: opp,
          score: Math.round(score.total * 10) / 10,
          oppRank,
          rounds,
          isFastTrack: isFastTrack(f) || isFastTrack(opp),
        }
      })

      scored.sort((a, b) => b.score - a.score)
      setSuggestions(scored.slice(0, 3))
    }

    setLoading(false)
  }

  async function bookToEvent() {
    const { opponentId, eventId, cardPos, titleType } = booking
    if (!fighter || !eventId) return
    setBooking(b => ({ ...b, saving: true }))
    const opp = suggestions.find(s => s.opponent.id === opponentId)
    if (!opp) return
    const ev = events.find(e => e.id === Number(eventId))
    const rounds = determineScheduledRounds(
      titleType === 'title', titleType === 'interim_title', cardPos,
      ev?.event_type as any ?? 'Fight Night', fighter, opp.opponent,
      null, opp.oppRank
    )
    const { error } = await supabase.from('fights').insert({
      event_id: Number(eventId),
      fighter1_id: fighter.id,
      fighter2_id: opponentId,
      division: fighter.primary_division,
      card_position: cardPos,
      title_type: titleType,
      scheduled_rounds: rounds,
    })
    if (error) alert('Error: ' + error.message)
    else router.push(`/events/${eventId}`)
    setBooking(b => ({ ...b, saving: false }))
  }

  async function queueFight() {
    const { opponentId } = booking
    if (!fighter) return
    setBooking(b => ({ ...b, saving: true }))
    const { error } = await supabase.from('matchmaking_suggestions').insert({
      fighter1_id: fighter.id,
      fighter2_id: opponentId,
      division: fighter.primary_division,
      status: 'pending',
    })
    if (error) alert('Error: ' + error.message)
    else setBooking({ opponentId: 0, mode: null, eventId: '', cardPos: 'main_card', titleType: 'none', saving: false })
    setBooking(b => ({ ...b, saving: false }))
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div>
  if (!fighter) return <div style={{ padding: 40, color: 'var(--muted)' }}>Fighter not found</div>

  const available = !fighter.available_date || new Date(fighter.available_date) <= new Date()

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, marginBottom: 24, padding: 0 }}>
        ← Back
      </button>

      {/* Header */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              {(fighter.is_champion || fighter.is_interim_champion) && (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 4, background: 'var(--gold)', color: '#000' }}>
                  {fighter.is_champion ? 'CHAMPION' : 'INTERIM CHAMPION'}
                </span>
              )}
              {!available && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: '#f9731622', color: '#f97316' }}>UNAVAILABLE</span>
              )}
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{fighter.first_name} {fighter.last_name}</h1>
            {fighter.nickname && <p style={{ fontSize: 16, color: 'var(--muted)', margin: '4px 0 0' }}>"{fighter.nickname}"</p>}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
              <span>{fighter.primary_division}</span>
              {fighter.nationality && <span>{fighter.nationality}</span>}
              {fighter.age && <span>Age {fighter.age}</span>}
              <span>{fighter.style}</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em' }}>
              <span style={{ color: 'var(--green)' }}>{fighter.wins}</span>
              <span style={{ color: 'var(--muted)', fontSize: 24, margin: '0 6px' }}>-</span>
              <span style={{ color: 'var(--red)' }}>{fighter.losses}</span>
              {fighter.draws > 0 && <><span style={{ color: 'var(--muted)', fontSize: 24, margin: '0 6px' }}>-</span><span style={{ color: 'var(--muted)' }}>{fighter.draws}</span></>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{fighter.wins_ko}KO · {fighter.wins_sub}SUB · {fighter.wins_dec}DEC</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 32, marginTop: 24, flexWrap: 'wrap' }}>
          <ScoreMeter label="Hype" value={fighter.hype_score} color="var(--accent)" />
          <ScoreMeter label="Dominance" value={fighter.dominance_score} color="var(--blue)" />
        </div>

        {!available && fighter.available_date && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: '#f9731611', borderRadius: 8, fontSize: 13, color: '#f97316' }}>
            {fighter.injury_description
              ? `Injured: ${fighter.injury_description} — Available ${new Date(fighter.available_date).toLocaleDateString('pl-PL')}`
              : `Available from ${new Date(fighter.available_date).toLocaleDateString('pl-PL')}`}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Win Streak', value: fighter.current_streak > 0 ? `W${fighter.current_streak}` : fighter.current_streak < 0 ? `L${Math.abs(fighter.current_streak)}` : '—' },
          { label: 'Contract Left', value: `${fighter.contract_fights_remaining} fights` },
          { label: 'UFC Debut', value: fighter.ufc_debut_date ? new Date(fighter.ufc_debut_date).toLocaleDateString('pl-PL') : '—' },
          { label: 'Last Fight', value: fighter.last_fight_date ? new Date(fighter.last_fight_date).toLocaleDateString('pl-PL') : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Fight Suggestions */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Fight Suggestions</h2>
          <Link href={`/matchmaker?f1=${fighter.id}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>Manual booking →</Link>
        </div>
        {suggestions.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {available ? 'No available opponents found in this division.' : 'Fighter is currently unavailable.'}
          </div>
        ) : suggestions.map((s, i) => {
          const isOpen = booking.opponentId === s.opponent.id && booking.mode !== null
          return (
            <div key={s.opponent.id} style={{ borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                    <Link href={`/roster/${s.opponent.id}`} style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)', textDecoration: 'none' }}>
                      {s.opponent.first_name} {s.opponent.last_name}
                    </Link>
                    {s.isFastTrack && (
                      <span style={{ fontSize: 10, color: '#f97316', fontWeight: 700, background: '#f9731622', padding: '2px 6px', borderRadius: 4 }}>FAST TRACK</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {s.opponent.wins}-{s.opponent.losses}
                    {s.oppRank !== null ? ` · #${s.oppRank} ${s.opponent.primary_division}` : ` · ${s.opponent.primary_division}`}
                    {' · '}{s.rounds}R
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginRight: 12 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{s.score}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>score</div>
                </div>
                <button
                  onClick={() => setBooking(b => ({
                    ...b,
                    opponentId: s.opponent.id,
                    mode: isOpen ? null : 'event',
                  }))}
                  style={{
                    background: isOpen ? 'var(--surface2)' : 'var(--accent)',
                    border: 'none', borderRadius: 8, padding: '8px 16px',
                    color: isOpen ? 'var(--foreground)' : '#fff',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {isOpen ? 'Cancel' : 'Book'}
                </button>
              </div>

              {/* Booking panel */}
              {isOpen && (
                <div style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
                  {/* Mode selector */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button onClick={() => setBooking(b => ({ ...b, mode: 'event' }))} style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: booking.mode === 'event' ? 'var(--accent)' : 'var(--surface)',
                      color: booking.mode === 'event' ? '#fff' : 'var(--muted)',
                    }}>Add to Event</button>
                    <button onClick={() => setBooking(b => ({ ...b, mode: 'queue' }))} style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: booking.mode === 'queue' ? 'var(--accent)' : 'var(--surface)',
                      color: booking.mode === 'queue' ? '#fff' : 'var(--muted)',
                    }}>Queue for Later</button>
                  </div>

                  {booking.mode === 'event' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={labelStyle}>Event</label>
                          <select value={booking.eventId} onChange={e => setBooking(b => ({ ...b, eventId: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                            <option value="">Select...</option>
                            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} ({new Date(ev.event_date).toLocaleDateString('pl-PL')})</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Position</label>
                          <select value={booking.cardPos} onChange={e => setBooking(b => ({ ...b, cardPos: e.target.value as CardPosition }))} style={{ ...inputStyle, width: '100%' }}>
                            <option value="main_event">Main Event</option>
                            <option value="co_main">Co-Main</option>
                            <option value="main_card">Main Card</option>
                            <option value="prelims">Prelims</option>
                            <option value="early_prelims">Early Prelims</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Title Fight</label>
                          <select value={booking.titleType} onChange={e => setBooking(b => ({ ...b, titleType: e.target.value as TitleType }))} style={{ ...inputStyle, width: '100%' }}>
                            <option value="none">No</option>
                            <option value="title">Title Fight</option>
                            <option value="interim_title">Interim Title</option>
                            <option value="contender">Contender</option>
                          </select>
                        </div>
                      </div>
                      <button onClick={bookToEvent} disabled={booking.saving || !booking.eventId} style={{
                        background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px',
                        color: '#fff', fontSize: 13, fontWeight: 700,
                        cursor: (booking.saving || !booking.eventId) ? 'not-allowed' : 'pointer',
                        opacity: (booking.saving || !booking.eventId) ? 0.6 : 1, alignSelf: 'flex-start',
                      }}>
                        {booking.saving ? 'Booking...' : 'Confirm & Add to Event'}
                      </button>
                    </div>
                  )}

                  {booking.mode === 'queue' && (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>
                        This fight will be saved as a pending suggestion. The system will be able to auto-assign it when building an event card.
                      </p>
                      <button onClick={queueFight} disabled={booking.saving} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 20px',
                        color: 'var(--foreground)', fontSize: 13, fontWeight: 600, cursor: booking.saving ? 'not-allowed' : 'pointer',
                      }}>
                        {booking.saving ? 'Saving...' : 'Queue Fight'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Fight History */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Fight History</h2>
        </div>
        {fights.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No fights recorded</div>
        ) : fights.map((fight, i) => {
          const isF1 = fight.fighter1_id === fighter.id
          const opponent = isF1 ? fight.fighter2 : fight.fighter1
          const won = fight.winner_id === fighter.id
          const isDraw = fight.result_method === 'Draw' || fight.result_method === 'No Contest'
          return (
            <div key={fight.id} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < fights.length - 1 ? '1px solid var(--border)' : 'none', gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0, background: isDraw ? 'var(--muted)' : won ? 'var(--green)' : 'var(--red)', color: '#fff' }}>
                {isDraw ? 'D' : won ? 'W' : 'L'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>vs. {opponent?.first_name} {opponent?.last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {fight.result_method} · R{fight.result_round} {fight.result_time}
                  {(fight as any).events?.name && ` · ${(fight as any).events.name}`}
                </div>
              </div>
              {fight.hype_rating && (
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Hype</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{fight.hype_rating}/10</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Dom</div>
                    <div style={{ fontWeight: 700, color: 'var(--blue)' }}>{fight.dominance_rating}/10</div>
                  </div>
                </div>
              )}
              {fight.title_type !== 'none' && (
                <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>{fight.title_type === 'title' ? 'TITLE' : 'INTERIM'}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em',
}
const inputStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--foreground)', fontSize: 13,
}

function ScoreMeter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{Math.round(value)}/100</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}
