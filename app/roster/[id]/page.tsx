'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Fighter, Fight, Event } from '@/lib/database.types'

interface FightWithEvent extends Fight {
  event?: Event
  fighter1?: Fighter
  fighter2?: Fighter
}

export default function FighterProfile() {
  const { id } = useParams()
  const router = useRouter()
  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [fights, setFights] = useState<FightWithEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) fetchData(Number(id))
  }, [id])

  async function fetchData(fighterId: number) {
    setLoading(true)
    const [{ data: f }, { data: fts }] = await Promise.all([
      supabase.from('fighters').select('*').eq('id', fighterId).single(),
      supabase
        .from('fights')
        .select('*, events(*), fighter1:fighters!fighter1_id(*), fighter2:fighters!fighter2_id(*)')
        .or(`fighter1_id.eq.${fighterId},fighter2_id.eq.${fighterId}`)
        .not('result_method', 'is', null)
        .order('created_at', { ascending: false }),
    ])
    setFighter(f)
    setFights(fts ?? [])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading...</div>
  if (!fighter) return <div style={{ padding: 40, color: 'var(--muted)' }}>Fighter not found</div>

  const available = fighter.available_date
    ? new Date(fighter.available_date) <= new Date()
    : true

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {/* Back */}
      <button onClick={() => router.back()} style={{
        background: 'none',
        border: 'none',
        color: 'var(--muted)',
        cursor: 'pointer',
        fontSize: 14,
        marginBottom: 24,
        padding: 0,
      }}>
        ← Back
      </button>

      {/* Header Card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 28,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              {(fighter.is_champion || fighter.is_interim_champion) && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'var(--gold)',
                  color: '#000',
                }}>
                  {fighter.is_champion ? 'CHAMPION' : 'INTERIM CHAMPION'}
                </span>
              )}
              {!available && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: '#f9731622',
                  color: '#f97316',
                }}>
                  UNAVAILABLE
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>
              {fighter.first_name} {fighter.last_name}
            </h1>
            {fighter.nickname && (
              <p style={{ fontSize: 16, color: 'var(--muted)', margin: '4px 0 0' }}>
                "{fighter.nickname}"
              </p>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
              <span>{fighter.primary_division}</span>
              {fighter.nationality && <span>{fighter.nationality}</span>}
              {fighter.age && <span>Age {fighter.age}</span>}
              <span>{fighter.style}</span>
            </div>
          </div>

          {/* Record */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em' }}>
              <span style={{ color: 'var(--green)' }}>{fighter.wins}</span>
              <span style={{ color: 'var(--muted)', fontSize: 24, margin: '0 6px' }}>-</span>
              <span style={{ color: 'var(--red)' }}>{fighter.losses}</span>
              {fighter.draws > 0 && (
                <>
                  <span style={{ color: 'var(--muted)', fontSize: 24, margin: '0 6px' }}>-</span>
                  <span style={{ color: 'var(--muted)' }}>{fighter.draws}</span>
                </>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {fighter.wins_ko}KO · {fighter.wins_sub}SUB · {fighter.wins_dec}DEC
            </div>
          </div>
        </div>

        {/* Scores */}
        <div style={{ display: 'flex', gap: 32, marginTop: 24, flexWrap: 'wrap' }}>
          <ScoreMeter label="Hype" value={fighter.hype_score} color="var(--accent)" />
          <ScoreMeter label="Dominance" value={fighter.dominance_score} color="var(--blue)" />
        </div>

        {/* Availability */}
        {!available && fighter.available_date && (
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            background: '#f9731611',
            borderRadius: 8,
            fontSize: 13,
            color: '#f97316',
          }}>
            {fighter.injury_description
              ? `Injured: ${fighter.injury_description} — Available ${new Date(fighter.available_date).toLocaleDateString('pl-PL')}`
              : `Available from ${new Date(fighter.available_date).toLocaleDateString('pl-PL')}`}
          </div>
        )}
      </div>

      {/* Stats breakdown */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        {[
          { label: 'Win Streak', value: fighter.current_streak > 0 ? `W${fighter.current_streak}` : fighter.current_streak < 0 ? `L${Math.abs(fighter.current_streak)}` : '—' },
          { label: 'Contract Left', value: `${fighter.contract_fights_remaining} fights` },
          { label: 'UFC Debut', value: fighter.ufc_debut_date ? new Date(fighter.ufc_debut_date).toLocaleDateString('pl-PL') : '—' },
          { label: 'Last Fight', value: fighter.last_fight_date ? new Date(fighter.last_fight_date).toLocaleDateString('pl-PL') : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Fight History */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Fight History</h2>
        </div>
        {fights.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No fights recorded</div>
        ) : (
          <div>
            {fights.map((fight, i) => {
              const isF1 = fight.fighter1_id === fighter.id
              const opponent = isF1 ? fight.fighter2 : fight.fighter1
              const won = fight.winner_id === fighter.id
              const isDraw = fight.result_method === 'Draw' || fight.result_method === 'No Contest'

              return (
                <div key={fight.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: i < fights.length - 1 ? '1px solid var(--border)' : 'none',
                  gap: 16,
                }}>
                  {/* Result badge */}
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                    background: isDraw ? 'var(--muted)' : won ? 'var(--green)' : 'var(--red)',
                    color: '#fff',
                  }}>
                    {isDraw ? 'D' : won ? 'W' : 'L'}
                  </div>

                  {/* Opponent */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      vs. {opponent?.first_name} {opponent?.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {fight.result_method} · R{fight.result_round} {fight.result_time}
                      {(fight as any).events?.name && ` · ${(fight as any).events.name}`}
                    </div>
                  </div>

                  {/* Ratings */}
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

                  {/* Title fight indicator */}
                  {fight.title_type !== 'none' && (
                    <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>
                      {fight.title_type === 'title' ? 'TITLE' : 'INTERIM'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
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
