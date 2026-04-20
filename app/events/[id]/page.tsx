'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Event, Fight, Fighter, CardPosition, FightResult, TitleType } from '@/lib/database.types'
import { DIVISIONS } from '@/lib/database.types'
import { rollInjury, updateFighterScores, calculateFightScore, determineScheduledRounds } from '@/lib/matchmaking'

interface FightWithFighters extends Fight {
  fighter1: Fighter
  fighter2: Fighter
}

const CARD_POSITION_LABELS: Record<CardPosition, string> = {
  main_event: 'Main Event',
  co_main: 'Co-Main Event',
  main_card: 'Main Card',
  prelims: 'Prelims',
  early_prelims: 'Early Prelims',
}

const CARD_ORDER: CardPosition[] = ['main_event', 'co_main', 'main_card', 'prelims', 'early_prelims']

const RESULT_METHODS: FightResult[] = [
  'KO/TKO', 'Submission', 'Unanimous Decision', 'Split Decision',
  'Majority Decision', 'Draw', 'No Contest',
]

export default function EventPage() {
  const { id } = useParams()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [fights, setFights] = useState<FightWithFighters[]>([])
  const [loading, setLoading] = useState(true)
  const [autoFilling, setAutoFilling] = useState(false)
  const [enteringResult, setEnteringResult] = useState<number | null>(null)
  const [resultForm, setResultForm] = useState({
    winner_id: '',
    result_method: 'KO/TKO' as FightResult,
    result_round: '1',
    result_time: '',
    hype_rating: '7',
    dominance_rating: '5',
    bonus_fotn: false,
    bonus_potn_winner: false,
  })

  useEffect(() => {
    if (id) fetchData(Number(id))
  }, [id])

  async function fetchData(eventId: number) {
    setLoading(true)
    const [{ data: ev }, { data: fts }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('fights').select('*, fighter1:fighters!fighter1_id(*), fighter2:fighters!fighter2_id(*)')
        .eq('event_id', eventId).order('card_position'),
    ])
    setEvent(ev)
    setFights(fts ?? [])
    setLoading(false)
  }

  async function submitResult(fight: FightWithFighters) {
    if (!resultForm.winner_id && resultForm.result_method !== 'Draw' && resultForm.result_method !== 'No Contest') {
      return alert('Select a winner')
    }
    const winnerId = resultForm.winner_id ? Number(resultForm.winner_id) : null
    const loserId = winnerId
      ? (winnerId === fight.fighter1_id ? fight.fighter2_id : fight.fighter1_id)
      : null

    const hype = Number(resultForm.hype_rating)
    const dominance = Number(resultForm.dominance_rating)

    // Update fight
    await supabase.from('fights').update({
      winner_id: winnerId,
      result_method: resultForm.result_method,
      result_round: Number(resultForm.result_round),
      result_time: resultForm.result_time,
      hype_rating: hype,
      dominance_rating: dominance,
      bonus_fotn: resultForm.bonus_fotn,
      bonus_potn_winner: resultForm.bonus_potn_winner,
    }).eq('id', fight.id)

    // Update fighters
    const fightDate = new Date(event!.event_date)
    for (const [fighter, isWinner] of [
      [fight.fighter1, fight.fighter1_id === winnerId],
      [fight.fighter2, fight.fighter2_id === winnerId],
    ] as [Fighter, boolean][]) {
      const isDraw = resultForm.result_method === 'Draw' || resultForm.result_method === 'No Contest'
      const scores = updateFighterScores(fighter, isWinner || isDraw, hype, dominance)
      const injury = rollInjury(
        fighter, isWinner, resultForm.result_method,
        Number(resultForm.result_round), dominance, fight.scheduled_rounds, 0
      )

      const newStreak = isDraw ? 0 : isWinner
        ? (fighter.current_streak >= 0 ? fighter.current_streak + 1 : 1)
        : (fighter.current_streak <= 0 ? fighter.current_streak - 1 : -1)

      // Calculate availability date
      let availableDate: string | null = null
      if (injury.injured) {
        const d = new Date(fightDate)
        d.setDate(d.getDate() + injury.weeksOut * 7)
        availableDate = d.toISOString().split('T')[0]
      } else {
        // Standard recovery time
        const d = new Date(fightDate)
        const isLoserKO = !isWinner && (resultForm.result_method === 'KO/TKO')
        const is5Round = fight.scheduled_rounds === 5
        const recoveryDays = isLoserKO ? 90 : is5Round ? 70 : 42
        d.setDate(d.getDate() + recoveryDays)
        availableDate = d.toISOString().split('T')[0]
      }

      const winInc = isWinner ? 1 : 0
      const lossInc = !isWinner && !isDraw ? 1 : 0
      const drawInc = isDraw ? 1 : 0

      const updates: Partial<Fighter> = {
        hype_score: scores.newHype,
        dominance_score: scores.newDominance,
        wins: fighter.wins + winInc,
        losses: fighter.losses + lossInc,
        draws: fighter.draws + drawInc,
        last_fight_date: fightDate.toISOString().split('T')[0],
        available_date: availableDate,
        current_streak: newStreak,
        status: injury.injured ? 'injured' : 'active',
        injury_end_date: injury.injured ? availableDate : null,
        injury_description: injury.injured ? injury.description : null,
      }

      if (isWinner) {
        const method = resultForm.result_method
        if (method === 'KO/TKO') updates.wins_ko = fighter.wins_ko + 1
        else if (method === 'Submission') updates.wins_sub = fighter.wins_sub + 1
        else updates.wins_dec = fighter.wins_dec + 1
      } else if (!isDraw) {
        const method = resultForm.result_method
        if (method === 'KO/TKO') updates.losses_ko = fighter.losses_ko + 1
        else if (method === 'Submission') updates.losses_sub = fighter.losses_sub + 1
        else updates.losses_dec = fighter.losses_dec + 1
      }

      await supabase.from('fighters').update(updates).eq('id', fighter.id)
    }

    setEnteringResult(null)
    fetchData(Number(id))
  }

  async function autoFill() {
    if (!event) return
    setAutoFilling(true)

    const bookedIds = new Set(fights.flatMap(f => [f.fighter1_id, f.fighter2_id]))

    const [{ data: allFighters }, { data: rankingsData }, { data: fightHistoryData }] = await Promise.all([
      supabase.from('fighters').select('*').eq('status', 'active'),
      supabase.from('current_rankings').select('*'),
      supabase.from('fights').select('fighter1_id, fighter2_id, hype_rating, dominance_rating').not('result_method', 'is', null),
    ])

    const availableFighters = (allFighters ?? []).filter(f =>
      !bookedIds.has(f.id) && (!f.available_date || new Date(f.available_date) <= new Date())
    )

    const rankMap: Record<string, Record<number, number>> = {}
    for (const r of rankingsData ?? []) {
      if (!rankMap[r.division]) rankMap[r.division] = {}
      rankMap[r.division][r.fighter_id] = r.rank
    }

    const historyMap: Record<string, { count: number; lastHype: number | null; lastDom: number | null }> = {}
    for (const f of fightHistoryData ?? []) {
      const key = [Math.min(f.fighter1_id, f.fighter2_id), Math.max(f.fighter1_id, f.fighter2_id)].join('-')
      if (!historyMap[key]) historyMap[key] = { count: 0, lastHype: null, lastDom: null }
      historyMap[key].count++
      historyMap[key].lastHype = f.hype_rating
      historyMap[key].lastDom = f.dominance_rating
    }

    const isPPV = event.event_type === 'PPV'
    const eventMaxFights = isPPV ? 11 : 8

    const targetSlots: Record<CardPosition, number> = isPPV
      ? { main_event: 1, co_main: 1, main_card: 3, prelims: 4, early_prelims: 2 }
      : { main_event: 1, co_main: 1, main_card: 2, prelims: 3, early_prelims: 1 }

    const existingSlots: Record<CardPosition, number> = { main_event: 0, co_main: 0, main_card: 0, prelims: 0, early_prelims: 0 }
    for (const f of fights) existingSlots[f.card_position]++

    const remainingSlots: Record<CardPosition, number> = {
      main_event: Math.max(0, targetSlots.main_event - existingSlots.main_event),
      co_main: Math.max(0, targetSlots.co_main - existingSlots.co_main),
      main_card: Math.max(0, targetSlots.main_card - existingSlots.main_card),
      prelims: Math.max(0, targetSlots.prelims - existingSlots.prelims),
      early_prelims: Math.max(0, targetSlots.early_prelims - existingSlots.early_prelims),
    }

    const usedFighters = new Set<number>()
    const newFights: any[] = []
    const currentDate = new Date()

    function getR(fighterId: number, division: string): number | null {
      return rankMap[division]?.[fighterId] ?? null
    }

    // PPV main event: champion vs #1 contender
    if (remainingSlots.main_event > 0 && isPPV) {
      const champions = availableFighters.filter(f => f.is_champion)
      for (const champ of champions) {
        if (usedFighters.has(champ.id)) continue
        const div = champ.champion_division ?? champ.primary_division
        const divRankings = rankMap[div] ?? {}
        const contenderEntry = Object.entries(divRankings)
          .sort(([, a], [, b]) => (a as number) - (b as number))
          .find(([fid]) => !usedFighters.has(Number(fid)) && !bookedIds.has(Number(fid)) && Number(fid) !== champ.id)
        if (!contenderEntry) continue
        const contender = availableFighters.find(f => f.id === Number(contenderEntry[0]))
        if (!contender) continue
        newFights.push({
          event_id: event.id, fighter1_id: champ.id, fighter2_id: contender.id,
          division: div, card_position: 'main_event' as CardPosition,
          title_type: 'title' as TitleType, scheduled_rounds: 5,
        })
        usedFighters.add(champ.id)
        usedFighters.add(contender.id)
        remainingSlots.main_event--
        break
      }
    }

    // Score all remaining same-division pairs
    const allPairs: { f1: Fighter; f2: Fighter; division: string; score: number }[] = []
    for (let i = 0; i < availableFighters.length; i++) {
      for (let j = i + 1; j < availableFighters.length; j++) {
        const f1 = availableFighters[i]
        const f2 = availableFighters[j]
        if (f1.primary_division !== f2.primary_division) continue
        const division = f1.primary_division
        const key = [Math.min(f1.id, f2.id), Math.max(f1.id, f2.id)].join('-')
        const hist = historyMap[key] ?? { count: 0, lastHype: null, lastDom: null }
        const sc = calculateFightScore(f1, f2, getR(f1.id, division), getR(f2.id, division),
          { f1vsf2Count: hist.count, lastFightHype: hist.lastHype, lastFightDominance: hist.lastDom },
          false, 0, currentDate)
        if (sc.total > -5) allPairs.push({ f1, f2, division, score: sc.total })
      }
    }
    allPairs.sort((a, b) => b.score - a.score)

    const slotOrder: CardPosition[] = ['main_event', 'co_main', 'main_card', 'prelims', 'early_prelims']
    for (const pos of slotOrder) {
      let slots = remainingSlots[pos]
      for (const pair of allPairs) {
        if (slots <= 0) break
        if (usedFighters.has(pair.f1.id) || usedFighters.has(pair.f2.id)) continue
        const rounds = determineScheduledRounds(false, false, pos, event.event_type as any,
          pair.f1, pair.f2, getR(pair.f1.id, pair.division), getR(pair.f2.id, pair.division))
        newFights.push({
          event_id: event.id, fighter1_id: pair.f1.id, fighter2_id: pair.f2.id,
          division: pair.division, card_position: pos,
          title_type: 'none' as TitleType, scheduled_rounds: rounds,
        })
        usedFighters.add(pair.f1.id)
        usedFighters.add(pair.f2.id)
        slots--
      }
    }

    if (newFights.length > 0) {
      const { error } = await supabase.from('fights').insert(newFights)
      if (error) alert('Error: ' + error.message)
    } else {
      alert('Not enough available fighters to fill the card.')
    }

    await fetchData(Number(id))
    setAutoFilling(false)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div>
  if (!event) return <div style={{ padding: 40, color: 'var(--muted)' }}>Event not found</div>

  const grouped = CARD_ORDER.reduce((acc, pos) => {
    const section = fights.filter(f => f.card_position === pos)
    if (section.length > 0) acc[pos] = section
    return acc
  }, {} as Record<CardPosition, FightWithFighters[]>)

  const isCompleted = event.status === 'completed'
  const allFightsHaveResults = fights.length > 0 && fights.every(f => f.result_method !== null)
  const maxFights = event.event_type === 'PPV' ? 11 : 8
  const atLimit = fights.length >= maxFights

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: 'var(--muted)',
        cursor: 'pointer', fontSize: 14, marginBottom: 24, padding: 0,
      }}>← Back</button>

      {/* Event header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                background: event.event_type === 'PPV' ? 'var(--accent)' : 'var(--surface2)',
                color: event.event_type === 'PPV' ? '#fff' : 'var(--muted)',
              }}>
                {event.event_type === 'PPV' ? `PPV${event.ppv_number ? ` #${event.ppv_number}` : ''}` : 'FIGHT NIGHT'}
              </span>
              <span style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                background: isCompleted ? '#22c55e22' : 'var(--surface2)',
                color: isCompleted ? 'var(--green)' : 'var(--muted)',
              }}>
                {isCompleted ? 'COMPLETED' : 'SCHEDULED'}
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{event.name}</h1>
            {event.location && <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>{event.location}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {new Date(event.event_date).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div style={{ fontSize: 13, color: atLimit ? 'var(--accent)' : 'var(--muted)', marginTop: 4, fontWeight: atLimit ? 700 : 400 }}>
              {fights.length} / {maxFights} fights{atLimit ? ' — limit osiągnięty' : ''}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          {!atLimit && (
            <a href={`/matchmaker?event=${event.id}`} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--foreground)', padding: '8px 16px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              + Add Fight
            </a>
          )}
          {!isCompleted && !atLimit && (
            <button onClick={autoFill} disabled={autoFilling} style={{
              background: autoFilling ? 'var(--surface2)' : 'var(--accent)', border: 'none',
              color: autoFilling ? 'var(--muted)' : '#fff',
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: autoFilling ? 'not-allowed' : 'pointer', opacity: autoFilling ? 0.7 : 1,
            }}>
              {autoFilling ? 'Filling...' : '⚡ Auto-fill Card'}
            </button>
          )}
          {allFightsHaveResults && !isCompleted && (
            <button onClick={async () => {
              await supabase.from('events').update({ status: 'completed' }).eq('id', event.id)
              const simId = localStorage.getItem('simId')
              if (simId) {
                await supabase.from('simulation_config').update({ sim_date: event.event_date }).eq('id', simId)
              }
              fetchData(Number(id))
            }} style={{
              background: 'var(--green)', border: 'none', color: '#fff',
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Complete Event ✓
            </button>
          )}
        </div>
      </div>

      {/* Fight card */}
      {fights.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 48, textAlign: 'center', color: 'var(--muted)',
        }}>
          No fights booked yet — use Add Fight or the Matchmaker
        </div>
      ) : (
        CARD_ORDER.filter(pos => grouped[pos]).map(pos => (
          <div key={pos} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
              {CARD_POSITION_LABELS[pos]}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {grouped[pos].map(fight => (
                <FightRow
                  key={fight.id}
                  fight={fight}
                  eventType={event.event_type}
                  entering={enteringResult === fight.id}
                  onEnterResult={() => {
                    setEnteringResult(fight.id)
                    setResultForm({
                      winner_id: '',
                      result_method: 'KO/TKO',
                      result_round: '1',
                      result_time: '',
                      hype_rating: '7',
                      dominance_rating: '5',
                      bonus_fotn: false,
                      bonus_potn_winner: false,
                    })
                  }}
                  onCancel={() => setEnteringResult(null)}
                  resultForm={resultForm}
                  setResultForm={setResultForm}
                  onSubmit={() => submitResult(fight)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function FightRow({ fight, eventType, entering, onEnterResult, onCancel, resultForm, setResultForm, onSubmit }: {
  fight: FightWithFighters
  eventType: string
  entering: boolean
  onEnterResult: () => void
  onCancel: () => void
  resultForm: any
  setResultForm: (f: any) => void
  onSubmit: () => void
}) {
  const hasResult = fight.result_method !== null
  const winner = hasResult ? (fight.winner_id === fight.fighter1_id ? fight.fighter1 : fight.fighter2) : null
  const loser = hasResult && fight.winner_id ? (fight.winner_id === fight.fighter1_id ? fight.fighter2 : fight.fighter1) : null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px' }}>
        {/* Fight header badges */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {fight.title_type !== 'none' && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#d4a01722', color: 'var(--gold)', letterSpacing: '0.1em' }}>
              {fight.title_type === 'title' ? 'TITLE FIGHT' : 'INTERIM TITLE'}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--muted)', padding: '2px 7px', borderRadius: 4, background: 'var(--surface2)' }}>
            {fight.division} · {fight.scheduled_rounds}R
          </span>
        </div>

        {/* Fighters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <FighterName fighter={fight.fighter1} won={hasResult ? fight.winner_id === fight.fighter1_id : null} />
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>VS</div>
          <FighterName fighter={fight.fighter2} won={hasResult ? fight.winner_id === fight.fighter2_id : null} />
          <div style={{ flex: 1 }} />

          {hasResult ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{fight.result_method}</div>
              <div>R{fight.result_round} {fight.result_time}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 10 }}>
                <span>Hype: <b style={{ color: 'var(--accent)' }}>{fight.hype_rating}</b></span>
                <span>Dom: <b style={{ color: 'var(--blue)' }}>{fight.dominance_rating}</b></span>
              </div>
            </div>
          ) : (
            <button onClick={onEnterResult} style={{
              background: 'var(--accent)', border: 'none', color: '#fff',
              padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              Enter Result
            </button>
          )}
        </div>
      </div>

      {/* Result form */}
      {entering && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '18px 20px', background: 'var(--surface2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
            {/* Winner */}
            <div>
              <label style={labelStyle}>Winner</label>
              <select value={resultForm.winner_id} onChange={e => setResultForm((f: any) => ({ ...f, winner_id: e.target.value }))}
                style={inputStyle}>
                <option value="">Draw / NC</option>
                <option value={fight.fighter1_id}>{fight.fighter1.first_name} {fight.fighter1.last_name}</option>
                <option value={fight.fighter2_id}>{fight.fighter2.first_name} {fight.fighter2.last_name}</option>
              </select>
            </div>
            {/* Method */}
            <div>
              <label style={labelStyle}>Method</label>
              <select value={resultForm.result_method} onChange={e => setResultForm((f: any) => ({ ...f, result_method: e.target.value }))}
                style={inputStyle}>
                {RESULT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {/* Round */}
            <div>
              <label style={labelStyle}>Round</label>
              <input type="number" min={1} max={fight.scheduled_rounds} value={resultForm.result_round}
                onChange={e => setResultForm((f: any) => ({ ...f, result_round: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            {/* Time */}
            <div>
              <label style={labelStyle}>Time</label>
              <input type="text" placeholder="e.g. 2:34" value={resultForm.result_time}
                onChange={e => setResultForm((f: any) => ({ ...f, result_time: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            {/* Hype */}
            <div>
              <label style={labelStyle}>Hype (1-10)</label>
              <input type="number" min={1} max={10} step={0.5} value={resultForm.hype_rating}
                onChange={e => setResultForm((f: any) => ({ ...f, hype_rating: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            {/* Dominance */}
            <div>
              <label style={labelStyle}>Dominance (1-10)</label>
              <input type="number" min={1} max={10} step={0.5} value={resultForm.dominance_rating}
                onChange={e => setResultForm((f: any) => ({ ...f, dominance_rating: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          {/* Bonuses */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <Checkbox label="Fight of the Night" checked={resultForm.bonus_fotn}
              onChange={v => setResultForm((f: any) => ({ ...f, bonus_fotn: v }))} />
            <Checkbox label="Perf. of the Night" checked={resultForm.bonus_potn_winner}
              onChange={v => setResultForm((f: any) => ({ ...f, bonus_potn_winner: v }))} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onSubmit} style={{
              background: 'var(--green)', border: 'none', color: '#fff',
              padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>Save Result</button>
            <button onClick={onCancel} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
              padding: '9px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FighterName({ fighter, won }: { fighter: Fighter; won: boolean | null }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{
        fontWeight: 700, fontSize: 15,
        color: won === true ? 'var(--green)' : won === false ? 'var(--red)' : 'var(--foreground)',
      }}>
        {fighter.first_name} {fighter.last_name}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        {fighter.wins}-{fighter.losses}
      </div>
    </div>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: checked ? 'var(--gold)' : 'var(--muted)' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
      {label}
    </label>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--muted)', display: 'block',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '7px 10px', color: 'var(--foreground)', fontSize: 13, width: '100%',
}
