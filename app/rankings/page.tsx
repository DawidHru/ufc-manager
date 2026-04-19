'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DIVISIONS } from '@/lib/database.types'
import type { Division, Ranking, P4PRanking } from '@/lib/database.types'

export default function RankingsPage() {
  const [tab, setTab] = useState<Division | 'P4P'>('Lightweight')
  const [rankings, setRankings] = useState<Record<string, Ranking[]>>({})
  const [p4p, setP4P] = useState<P4PRanking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: divRankings }, { data: p4pData }] = await Promise.all([
      supabase.from('current_rankings').select('*').order('rank'),
      supabase.from('current_p4p').select('*').order('rank'),
    ])

    const grouped: Record<string, Ranking[]> = {}
    for (const r of divRankings ?? []) {
      if (!grouped[r.division]) grouped[r.division] = []
      grouped[r.division].push(r)
    }
    setRankings(grouped)
    setP4P(p4pData ?? [])
    setLoading(false)
  }

  const TABS: (Division | 'P4P')[] = [...DIVISIONS, 'P4P']

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Rankings</h1>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
        marginBottom: 28,
        background: 'var(--surface)',
        padding: 6,
        borderRadius: 12,
        border: '1px solid var(--border)',
        width: 'fit-content',
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: 'none',
            fontSize: 13,
            fontWeight: tab === t ? 700 : 400,
            cursor: 'pointer',
            background: tab === t ? 'var(--accent)' : 'transparent',
            color: tab === t ? '#fff' : 'var(--muted)',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}>
            {t === 'P4P' ? 'P4P Top 15' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40 }}>Loading...</div>
      ) : tab === 'P4P' ? (
        <P4PList fighters={p4p} />
      ) : (
        <DivisionRankings fighters={rankings[tab] ?? []} division={tab} />
      )}
    </div>
  )
}

function DivisionRankings({ fighters, division }: { fighters: Ranking[]; division: Division }) {
  const champion = fighters.find(f => f.rank === 0)
  const interimChamp = fighters.find(f => f.is_interim_champion)
  const ranked = fighters.filter(f => f.rank > 0 && f.rank <= 15).sort((a, b) => a.rank - b.rank)

  if (fighters.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--muted)',
      }}>
        No rankings yet for {division}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Champion */}
      {champion && (
        <div style={{
          background: 'linear-gradient(135deg, #d4a01722, #d4a01708)',
          border: '1px solid var(--gold)',
          borderRadius: 12,
          padding: '18px 24px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 24 }}>🥇</span>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>CHAMPION</div>
              <Link href={`/roster/${champion.fighter_id}`} style={{
                fontSize: 18, fontWeight: 800, color: 'var(--foreground)', textDecoration: 'none',
              }}>
                {champion.first_name} {champion.last_name}
              </Link>
              {champion.nickname && <div style={{ fontSize: 12, color: 'var(--muted)' }}>"{champion.nickname}"</div>}
            </div>
          </div>
          <RecordBadge wins={champion.wins!} losses={champion.losses!} draws={champion.draws!} />
        </div>
      )}

      {/* Interim champion */}
      {interimChamp && (
        <div style={{
          background: 'linear-gradient(135deg, #d4a01711, #00000000)',
          border: '1px solid #d4a01766',
          borderRadius: 12,
          padding: '16px 24px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20 }}>🥈</span>
            <div>
              <div style={{ fontSize: 11, color: '#d4a01799', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>INTERIM CHAMPION</div>
              <Link href={`/roster/${interimChamp.fighter_id}`} style={{
                fontSize: 16, fontWeight: 700, color: 'var(--foreground)', textDecoration: 'none',
              }}>
                {interimChamp.first_name} {interimChamp.last_name}
              </Link>
            </div>
          </div>
          <RecordBadge wins={interimChamp.wins!} losses={interimChamp.losses!} draws={interimChamp.draws!} />
        </div>
      )}

      {/* Top 15 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
      }}>
        {ranked.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No ranked fighters</div>
        ) : ranked.map((f, i) => (
          <div key={f.fighter_id} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '13px 20px',
            borderBottom: i < ranked.length - 1 ? '1px solid var(--border)' : 'none',
            gap: 16,
          }}>
            <div style={{
              width: 28,
              textAlign: 'center',
              fontWeight: 800,
              fontSize: 15,
              color: f.rank <= 3 ? 'var(--gold)' : 'var(--muted)',
              flexShrink: 0,
            }}>
              #{f.rank}
            </div>
            <div style={{ flex: 1 }}>
              <Link href={`/roster/${f.fighter_id}`} style={{
                fontWeight: 600, fontSize: 14, color: 'var(--foreground)', textDecoration: 'none',
              }}>
                {f.first_name} {f.last_name}
              </Link>
              {f.nickname && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>"{f.nickname}"</span>}
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <MiniScore label="Hype" value={f.hype_score ?? 0} color="var(--accent)" />
              <RecordBadge wins={f.wins!} losses={f.losses!} draws={f.draws!} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function P4PList({ fighters }: { fighters: P4PRanking[] }) {
  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
      }}>
        {fighters.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
            No P4P rankings yet
          </div>
        ) : fighters.slice(0, 15).map((f, i) => (
          <div key={f.fighter_id} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '13px 20px',
            borderBottom: i < Math.min(fighters.length, 15) - 1 ? '1px solid var(--border)' : 'none',
            gap: 16,
          }}>
            <div style={{
              width: 28,
              textAlign: 'center',
              fontWeight: 800,
              fontSize: 15,
              color: f.rank <= 3 ? 'var(--gold)' : 'var(--muted)',
              flexShrink: 0,
            }}>
              #{f.rank}
            </div>
            <div style={{ flex: 1 }}>
              <Link href={`/roster/${f.fighter_id}`} style={{
                fontWeight: 600, fontSize: 14, color: 'var(--foreground)', textDecoration: 'none',
              }}>
                {f.first_name} {f.last_name}
              </Link>
              {f.nickname && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>"{f.nickname}"</span>}
              <span style={{
                marginLeft: 10, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                background: 'var(--surface2)', color: 'var(--muted)',
              }}>
                {f.primary_division}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {f.is_champion && <span style={{ fontSize: 14 }}>🥇</span>}
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {f.p4p_score?.toFixed(1)}
              </div>
              <RecordBadge wins={f.wins!} losses={f.losses!} draws={0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecordBadge({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--green)' }}>{wins}</span>
      <span style={{ color: 'var(--muted)', margin: '0 3px' }}>-</span>
      <span style={{ color: 'var(--red)' }}>{losses}</span>
      {draws > 0 && <span style={{ color: 'var(--muted)' }}>-{draws}</span>}
    </div>
  )
}

function MiniScore({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', fontSize: 11 }}>
      <div style={{ color: 'var(--muted)', marginBottom: 1 }}>{label}</div>
      <div style={{ fontWeight: 700, color }}>{Math.round(value)}</div>
    </div>
  )
}
