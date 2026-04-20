'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Fighter, Division, FighterStatus } from '@/lib/database.types'
import { DIVISIONS } from '@/lib/database.types'
import { getSimId } from '@/lib/sim'

const STATUS_COLOR: Record<FighterStatus, string> = {
  active: 'var(--green)',
  injured: '#f97316',
  suspended: '#a855f7',
  released: 'var(--muted)',
  retired: 'var(--muted)',
}

const STATUS_LABEL: Record<FighterStatus, string> = {
  active: 'Active',
  injured: 'Injured',
  suspended: 'Suspended',
  released: 'Released',
  retired: 'Retired',
}

export default function RosterPage() {
  const [fighters, setFighters] = useState<Fighter[]>([])
  const [loading, setLoading] = useState(true)
  const [divisionFilter, setDivisionFilter] = useState<Division | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<FighterStatus | 'All'>('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchFighters()
  }, [])

  async function fetchFighters() {
    setLoading(true)
    const simId = getSimId()
    const query = supabase.from('fighters').select('*').order('hype_score', { ascending: false })
    if (simId) query.eq('sim_id', simId)
    const { data } = await query
    setFighters(data ?? [])
    setLoading(false)
  }

  const filtered = fighters.filter(f => {
    if (divisionFilter !== 'All' && f.primary_division !== divisionFilter) return false
    if (statusFilter !== 'All' && f.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${f.first_name} ${f.last_name} ${f.nickname ?? ''}`.toLowerCase()
      if (!name.includes(q)) return false
    }
    return true
  })

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Roster</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>
            {fighters.filter(f => f.status === 'active').length} active fighters
          </p>
        </div>
        <Link href="/roster/add" style={{
          background: 'var(--accent)',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
        }}>
          + Add Fighter
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Search fighters..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 14px',
            color: 'var(--foreground)',
            fontSize: 14,
            width: 220,
          }}
        />
        <select
          value={divisionFilter}
          onChange={e => setDivisionFilter(e.target.value as Division | 'All')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 14px',
            color: 'var(--foreground)',
            fontSize: 14,
          }}
        >
          <option value="All">All Divisions</option>
          {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as FighterStatus | 'All')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 14px',
            color: 'var(--foreground)',
            fontSize: 14,
          }}
        >
          <option value="All">All Statuses</option>
          <option value="active">Active</option>
          <option value="injured">Injured</option>
          <option value="suspended">Suspended</option>
          <option value="released">Released</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : (
        <div style={{
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Fighter', 'Division', 'Record', 'Hype', 'Dominance', 'Status', 'Streak', ''].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    No fighters found
                  </td>
                </tr>
              ) : filtered.map((f, i) => (
                <tr key={f.id} style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.1s',
                }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {(f.is_champion || f.is_interim_champion) && (
                        <span style={{ fontSize: 14 }} title={f.is_champion ? 'Champion' : 'Interim Champion'}>
                          {f.is_champion ? '🥇' : '🥈'}
                        </span>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {f.first_name} {f.last_name}
                        </div>
                        {f.nickname && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>"{f.nickname}"</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)' }}>
                    {f.primary_division}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600 }}>
                    <span style={{ color: 'var(--green)' }}>{f.wins}</span>
                    <span style={{ color: 'var(--muted)', margin: '0 3px' }}>-</span>
                    <span style={{ color: 'var(--red)' }}>{f.losses}</span>
                    {f.draws > 0 && <span style={{ color: 'var(--muted)' }}>-{f.draws}</span>}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <HypeBar value={f.hype_score} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <HypeBar value={f.dominance_score} color="#3b82f6" />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: STATUS_COLOR[f.status] + '22',
                      color: STATUS_COLOR[f.status],
                      letterSpacing: '0.05em',
                    }}>
                      {STATUS_LABEL[f.status]}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13 }}>
                    <StreakBadge streak={f.current_streak} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <Link href={`/roster/${f.id}`} style={{
                      fontSize: 12,
                      color: 'var(--accent)',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}>
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HypeBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 60,
        height: 4,
        background: 'var(--border)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 28 }}>{Math.round(value)}</span>
    </div>
  )
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
  if (streak > 0) return (
    <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: 12 }}>
      W{streak}
    </span>
  )
  return (
    <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 12 }}>
      L{Math.abs(streak)}
    </span>
  )
}
