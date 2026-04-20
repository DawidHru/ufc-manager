'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DIVISIONS } from '@/lib/database.types'
import type { Division, Fighter } from '@/lib/database.types'
import { calculateRankingScore, calculateP4PScore } from '@/lib/matchmaking'

type Mode = 'auto' | 'manual'

interface RankedFighter extends Fighter {
  rank: number
  score?: number
}

export default function RankingsPage() {
  const [tab, setTab] = useState<Division | 'P4P'>('Lightweight')
  const [mode, setMode] = useState<Mode>('auto')
  const [loading, setLoading] = useState(true)
  const [fighters, setFighters] = useState<Fighter[]>([])
  // division → ranked rows from current_rankings view
  const [divRankings, setDivRankings] = useState<Record<string, any[]>>({})
  // p4p from current_p4p view
  const [p4pRows, setP4pRows] = useState<any[]>([])

  // Auto mode
  const [calculating, setCalculating] = useState(false)
  const [preview, setPreview] = useState<RankedFighter[] | null>(null)
  const [saving, setSaving] = useState(false)

  // Manual mode
  const [manualList, setManualList] = useState<RankedFighter[]>([])
  const [manualDirty, setManualDirty] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: rankRows }, { data: p4pData }, { data: fighterData }] = await Promise.all([
      supabase.from('current_rankings').select('*').order('rank'),
      supabase.from('current_p4p').select('*').order('rank'),
      supabase.from('fighters').select('*').not('status', 'in', '("released","retired")'),
    ])
    const grouped: Record<string, any[]> = {}
    for (const r of rankRows ?? []) {
      if (!grouped[r.division]) grouped[r.division] = []
      grouped[r.division].push(r)
    }
    setDivRankings(grouped)
    setP4pRows(p4pData ?? [])
    setFighters(fighterData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Reset preview and load manual list when tab/mode changes
  useEffect(() => {
    setPreview(null)
    if (mode === 'manual' && tab !== 'P4P') {
      const existing = (divRankings[tab] ?? [])
        .filter((r: any) => r.rank >= 1 && r.rank <= 15)
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((r: any) => {
          const f = fighters.find(f => f.id === r.fighter_id)
          return f ? { ...f, rank: r.rank } : null
        })
        .filter(Boolean) as RankedFighter[]
      setManualList(existing)
      setManualDirty(false)
    }
  }, [tab, mode, divRankings, fighters])

  // ── Auto recalculate division ──────────────────────────────────────────────
  async function recalcDiv(division: Division) {
    setCalculating(true)
    setPreview(null)

    const divFighters = fighters.filter(f =>
      f.primary_division === division || f.secondary_division === division
    )

    const { data: fightData } = await supabase
      .from('fights')
      .select('fighter1_id, fighter2_id, winner_id, hype_rating, dominance_rating, division')
      .eq('division', division)
      .not('result_method', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300)

    const fights = fightData ?? []
    const rankMap: Record<number, number> = {}
    for (const r of divRankings[division] ?? []) rankMap[r.fighter_id] = r.rank

    const scored = divFighters.map(fighter => {
      const myFights = fights
        .filter(f => f.fighter1_id === fighter.id || f.fighter2_id === fighter.id)
        .slice(0, 3)
      const stats = myFights.map(f => {
        const oppId = f.fighter1_id === fighter.id ? f.fighter2_id : f.fighter1_id
        const won = f.winner_id === fighter.id
        return {
          hype: (f.hype_rating ?? 5) * (won ? 1.2 : 0.8),
          dominance: won ? (f.dominance_rating ?? 5) : 10 - (f.dominance_rating ?? 5),
          opponentRank: rankMap[oppId] ?? null,
        }
      })
      return { fighter, score: calculateRankingScore(fighter, stats) }
    })

    scored.sort((a, b) => b.score - a.score)
    const top15 = scored.slice(0, 15).map((s, i) => ({ ...s.fighter, rank: i + 1, score: s.score }))
    setPreview(top15)
    setCalculating(false)
  }

  // ── Auto recalculate P4P ───────────────────────────────────────────────────
  async function recalcP4P() {
    setCalculating(true)
    setPreview(null)

    const { data: fightData } = await supabase
      .from('fights')
      .select('fighter1_id, fighter2_id, winner_id, hype_rating, dominance_rating')
      .not('result_method', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)

    const fights = fightData ?? []
    const rankMap: Record<number, number> = {}
    for (const rows of Object.values(divRankings)) {
      for (const r of rows as any[]) rankMap[r.fighter_id] = r.rank
    }

    const scored = fighters.map(fighter => {
      const myFights = fights
        .filter(f => f.fighter1_id === fighter.id || f.fighter2_id === fighter.id)
        .slice(0, 3)
      const stats = myFights.map(f => {
        const oppId = f.fighter1_id === fighter.id ? f.fighter2_id : f.fighter1_id
        const won = f.winner_id === fighter.id
        return {
          hype: (f.hype_rating ?? 5) * (won ? 1.2 : 0.8),
          dominance: won ? (f.dominance_rating ?? 5) : 10 - (f.dominance_rating ?? 5),
          opponentRank: rankMap[oppId] ?? null,
        }
      })
      const divScore = calculateRankingScore(fighter, stats)
      const p4p = calculateP4PScore(fighter, divScore) * (fighter.is_champion ? 1.3 : 1)
      return { fighter, score: p4p }
    })

    scored.sort((a, b) => b.score - a.score)
    const top15 = scored.slice(0, 15).map((s, i) => ({ ...s.fighter, rank: i + 1, score: s.score }))
    setPreview(top15)
    setCalculating(false)
  }

  // ── Save auto preview ──────────────────────────────────────────────────────
  async function saveAuto() {
    if (!preview) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]

    if (tab === 'P4P') {
      await supabase.from('p4p_rankings').delete().eq('snapshot_date', today)
      await supabase.from('p4p_rankings').insert(
        preview.map(f => ({ fighter_id: f.id, rank: f.rank, p4p_score: f.score ?? 0, snapshot_date: today }))
      )
    } else {
      await supabase.from('rankings').delete().eq('division', tab).eq('snapshot_date', today)
      await supabase.from('rankings').insert(
        preview.map(f => ({ fighter_id: f.id, division: tab, rank: f.rank, snapshot_date: today }))
      )
    }

    setPreview(null)
    await fetchAll()
    setSaving(false)
  }

  // ── Manual mode ────────────────────────────────────────────────────────────
  function moveUp(idx: number) {
    if (idx === 0) return
    const list = [...manualList]
    ;[list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]
    list.forEach((f, i) => (f.rank = i + 1))
    setManualList(list)
    setManualDirty(true)
  }

  function moveDown(idx: number) {
    if (idx === manualList.length - 1) return
    const list = [...manualList]
    ;[list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]
    list.forEach((f, i) => (f.rank = i + 1))
    setManualList(list)
    setManualDirty(true)
  }

  function addFighter(fighter: Fighter) {
    if (manualList.length >= 15) return alert('Ranking is full (max 15)')
    setManualList(prev => {
      const updated = [...prev, { ...fighter, rank: prev.length + 1 }]
      return updated
    })
    setManualDirty(true)
  }

  function removeFighter(id: number) {
    const list = manualList.filter(f => f.id !== id)
    list.forEach((f, i) => (f.rank = i + 1))
    setManualList(list)
    setManualDirty(true)
  }

  async function saveManual() {
    if (!manualDirty || tab === 'P4P') return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('rankings').delete().eq('division', tab).eq('snapshot_date', today)
    if (manualList.length > 0) {
      await supabase.from('rankings').insert(
        manualList.map(f => ({ fighter_id: f.id, division: tab, rank: f.rank, snapshot_date: today }))
      )
    }
    setManualDirty(false)
    await fetchAll()
    setSaving(false)
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const champion = tab !== 'P4P'
    ? fighters.find(f => f.is_champion && f.champion_division === (tab as Division))
    : null
  const interimChamp = tab !== 'P4P'
    ? fighters.find(f => f.is_interim_champion && f.champion_division === (tab as Division))
    : null

  const currentRanked = tab !== 'P4P'
    ? (divRankings[tab] ?? []).filter((r: any) => r.rank >= 1 && r.rank <= 15).sort((a: any, b: any) => a.rank - b.rank)
    : p4pRows.slice(0, 15)

  const unrankedFighters = tab !== 'P4P'
    ? fighters.filter(f =>
        (f.primary_division === tab || f.secondary_division === tab) &&
        !manualList.find(r => r.id === f.id) &&
        !(f.is_champion && f.champion_division === tab)
      )
    : []

  const displayList: RankedFighter[] = mode === 'manual' && tab !== 'P4P'
    ? manualList
    : (preview ?? currentRanked.map((r: any) => {
        const f = fighters.find(fi => fi.id === r.fighter_id)
        return f ? { ...f, rank: r.rank, score: r.p4p_score } : null
      }).filter(Boolean) as RankedFighter[])

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Rankings</h1>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, gap: 4 }}>
          {(['auto', 'manual'] as Mode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setPreview(null) }} style={{
              padding: '7px 22px', borderRadius: 6, border: 'none', fontSize: 13,
              fontWeight: mode === m ? 700 : 400, cursor: 'pointer',
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--muted)',
            }}>
              {m === 'auto' ? 'Auto' : 'Manual'}
            </button>
          ))}
        </div>
      </div>

      {/* Division tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 28, background: 'var(--surface)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', width: 'fit-content' }}>
        {([...DIVISIONS, 'P4P'] as (Division | 'P4P')[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13,
            fontWeight: tab === t ? 700 : 400, cursor: 'pointer',
            background: tab === t ? 'var(--accent)' : 'transparent',
            color: tab === t ? '#fff' : 'var(--muted)',
            whiteSpace: 'nowrap',
          }}>
            {t === 'P4P' ? 'P4P Top 15' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40 }}>Loading...</div>
      ) : (
        <div style={{ maxWidth: 720 }}>
          {/* Auto mode toolbar */}
          {mode === 'auto' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
              <button onClick={() => tab === 'P4P' ? recalcP4P() : recalcDiv(tab as Division)}
                disabled={calculating} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 18px', color: 'var(--foreground)',
                  fontSize: 13, fontWeight: 600, cursor: calculating ? 'not-allowed' : 'pointer',
                  opacity: calculating ? 0.6 : 1,
                }}>
                {calculating ? 'Calculating...' : 'Recalculate Rankings'}
              </button>
              {preview && (
                <button onClick={saveAuto} disabled={saving} style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 8,
                  padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}>
                  {saving ? 'Saving...' : 'Apply Rankings'}
                </button>
              )}
              {preview && (
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                  Preview — click Apply to save
                </span>
              )}
            </div>
          )}

          {/* Manual mode toolbar */}
          {mode === 'manual' && tab !== 'P4P' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {manualList.length} / 15 ranked
              </span>
              {manualDirty && (
                <button onClick={saveManual} disabled={saving} style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 8,
                  padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}>
                  {saving ? 'Saving...' : 'Save Rankings'}
                </button>
              )}
            </div>
          )}
          {mode === 'manual' && tab === 'P4P' && (
            <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20, fontSize: 13, color: 'var(--muted)' }}>
              P4P rankings can only be edited in Auto mode.
            </div>
          )}

          {/* Champion (not for P4P) */}
          {tab !== 'P4P' && champion && (
            <div style={{
              background: 'linear-gradient(135deg, #d4a01722, #d4a01708)', border: '1px solid var(--gold)',
              borderRadius: 12, padding: '18px 24px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 22 }}>🥇</span>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>CHAMPION</div>
                  <Link href={`/roster/${champion.id}`} style={{ fontSize: 17, fontWeight: 800, color: 'var(--foreground)', textDecoration: 'none' }}>
                    {champion.first_name} {champion.last_name}
                  </Link>
                  {champion.nickname && <div style={{ fontSize: 12, color: 'var(--muted)' }}>"{champion.nickname}"</div>}
                </div>
              </div>
              <Record wins={champion.wins} losses={champion.losses} draws={champion.draws} />
            </div>
          )}

          {/* Interim champion */}
          {tab !== 'P4P' && interimChamp && (
            <div style={{
              background: 'transparent', border: '1px solid #d4a01766',
              borderRadius: 12, padding: '14px 24px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 18 }}>🥈</span>
                <div>
                  <div style={{ fontSize: 11, color: '#d4a01799', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>INTERIM CHAMPION</div>
                  <Link href={`/roster/${interimChamp.id}`} style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none' }}>
                    {interimChamp.first_name} {interimChamp.last_name}
                  </Link>
                </div>
              </div>
              <Record wins={interimChamp.wins} losses={interimChamp.losses} draws={interimChamp.draws} />
            </div>
          )}

          {/* Rankings list */}
          {displayList.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
              {mode === 'auto'
                ? `No rankings yet — click "Recalculate Rankings" to generate.`
                : `No ranked fighters — add from the list below.`}
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              {displayList.map((f, i) => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', padding: '12px 20px', gap: 14,
                  borderBottom: i < displayList.length - 1 ? '1px solid var(--border)' : 'none',
                  background: preview ? '#d4a01708' : 'transparent',
                }}>
                  <div style={{ width: 28, textAlign: 'center', fontWeight: 800, fontSize: 15, color: f.rank <= 3 ? 'var(--gold)' : 'var(--muted)', flexShrink: 0 }}>
                    #{f.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/roster/${f.id}`} style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)', textDecoration: 'none' }}>
                      {f.first_name} {f.last_name}
                    </Link>
                    {f.nickname && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>"{f.nickname}"</span>}
                    {tab === 'P4P' && <span style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)' }}>{f.primary_division}</span>}
                    {tab === 'P4P' && f.is_champion && <span style={{ marginLeft: 6, fontSize: 12 }}>🥇</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                    {f.score !== undefined && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{f.score.toFixed(1)}</span>
                    )}
                    <Record wins={f.wins} losses={f.losses} draws={f.draws} />
                    {mode === 'manual' && tab !== 'P4P' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => moveUp(i)} style={arrowBtn} disabled={i === 0}>▲</button>
                        <button onClick={() => moveDown(i)} style={arrowBtn} disabled={i === displayList.length - 1}>▼</button>
                      </div>
                    )}
                    {mode === 'manual' && tab !== 'P4P' && (
                      <button onClick={() => removeFighter(f.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual — add unranked fighters */}
          {mode === 'manual' && tab !== 'P4P' && unrankedFighters.length > 0 && manualList.length < 15 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
                Unranked fighters — click to add
              </div>
              {unrankedFighters.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 14, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{f.first_name} {f.last_name}</span>
                    {f.nickname && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>"{f.nickname}"</span>}
                  </div>
                  <Record wins={f.wins} losses={f.losses} draws={f.draws} />
                  <button onClick={() => addFighter(f)} style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', color: 'var(--foreground)',
                  }}>
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const arrowBtn: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '1px 6px', fontSize: 10, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1.4,
}

function Record({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--green)' }}>{wins}</span>
      <span style={{ color: 'var(--muted)', margin: '0 2px' }}>-</span>
      <span style={{ color: 'var(--red)' }}>{losses}</span>
      {draws > 0 && <span style={{ color: 'var(--muted)' }}>-{draws}</span>}
    </div>
  )
}
