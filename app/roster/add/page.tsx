'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DIVISIONS } from '@/lib/database.types'
import type { Division, FighterStyle } from '@/lib/database.types'
import { getSimId } from '@/lib/sim'

const STYLES: FighterStyle[] = ['Striker', 'Wrestler', 'Grappler', 'All-around']

function randomRecord(): { wins: number; losses: number; wins_ko: number; wins_sub: number; wins_dec: number } {
  const wins = 8 + Math.floor(Math.random() * 14)
  const losses = Math.max(0, Math.floor(Math.random() * Math.floor(wins * 0.4)))
  const wins_ko = Math.floor(Math.random() * (wins * 0.5))
  const wins_sub = Math.floor(Math.random() * (wins - wins_ko) * 0.6)
  const wins_dec = wins - wins_ko - wins_sub
  return { wins, losses, wins_ko, wins_sub, wins_dec }
}

export default function AddFighterPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    nickname: '',
    nationality: '',
    age: '',
    primary_division: 'Lightweight' as Division,
    style: 'All-around' as FighterStyle,
    wins: '',
    losses: '',
    draws: '',
    wins_ko: '',
    wins_sub: '',
    wins_dec: '',
    losses_ko: '',
    losses_sub: '',
    losses_dec: '',
    ufc_debut_date: '',
  })

  function applyRandom() {
    const rec = randomRecord()
    setForm(f => ({
      ...f,
      wins: String(rec.wins),
      losses: String(rec.losses),
      wins_ko: String(rec.wins_ko),
      wins_sub: String(rec.wins_sub),
      wins_dec: String(rec.wins_dec),
      losses_ko: '0',
      losses_sub: '0',
      losses_dec: String(rec.losses),
    }))
  }

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function save() {
    if (!form.first_name || !form.last_name) return alert('Name is required')
    if (!form.nationality.trim()) return alert('Nationality is required')
    if (!form.age) return alert('Age is required')
    setSaving(true)

    const wins = Number(form.wins) || 0
    const losses = Number(form.losses) || 0
    const streak = wins > 0 && losses === 0 ? wins : 0

    const simId = getSimId()
    const { error } = await supabase.from('fighters').insert({
      sim_id: simId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      nickname: form.nickname.trim() || null,
      nationality: form.nationality.trim(),
      age: Number(form.age),
      primary_division: form.primary_division,
      style: form.style,
      wins,
      losses,
      draws: Number(form.draws) || 0,
      wins_ko: Number(form.wins_ko) || 0,
      wins_sub: Number(form.wins_sub) || 0,
      wins_dec: Number(form.wins_dec) || 0,
      losses_ko: Number(form.losses_ko) || 0,
      losses_sub: Number(form.losses_sub) || 0,
      losses_dec: Number(form.losses_dec) || 0,
      hype_score: 50,
      dominance_score: 50,
      ufc_debut_date: form.ufc_debut_date || null,
      current_streak: streak,
      contract_fights_remaining: 4,
    })

    if (error) {
      alert('Error: ' + error.message)
    } else {
      router.push('/roster')
    }
    setSaving(false)
  }

  return (
    <div style={{ padding: 32, maxWidth: 680 }}>
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: 'var(--muted)',
        cursor: 'pointer', fontSize: 14, marginBottom: 24, padding: 0,
      }}>← Back</button>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28 }}>Add Fighter</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="First Name *" value={form.first_name} onChange={v => set('first_name', v)} />
          <Field label="Last Name *" value={form.last_name} onChange={v => set('last_name', v)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Nickname" value={form.nickname} onChange={v => set('nickname', v)} />
          <Field label="Nationality *" value={form.nationality} onChange={v => set('nationality', v)} />
          <Field label="Age *" value={form.age} onChange={v => set('age', v)} type="number" />
        </div>

        {/* Division & Style */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Division</label>
            <select value={form.primary_division} onChange={e => set('primary_division', e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14 }}>
              {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Style</label>
            <select value={form.style} onChange={e => set('style', e.target.value as FighterStyle)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14 }}>
              {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Record */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Professional Record</h3>
            <button onClick={applyRandom} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--foreground)', cursor: 'pointer', fontSize: 12, padding: '6px 12px',
            }}>
              Random Record
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <Field label="Wins" value={form.wins} onChange={v => set('wins', v)} type="number" />
            <Field label="Losses" value={form.losses} onChange={v => set('losses', v)} type="number" />
            <Field label="Draws" value={form.draws} onChange={v => set('draws', v)} type="number" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <Field label="Wins by KO" value={form.wins_ko} onChange={v => set('wins_ko', v)} type="number" />
            <Field label="Wins by Sub" value={form.wins_sub} onChange={v => set('wins_sub', v)} type="number" />
            <Field label="Wins by Dec" value={form.wins_dec} onChange={v => set('wins_dec', v)} type="number" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Field label="Losses by KO" value={form.losses_ko} onChange={v => set('losses_ko', v)} type="number" />
            <Field label="Losses by Sub" value={form.losses_sub} onChange={v => set('losses_sub', v)} type="number" />
            <Field label="Losses by Dec" value={form.losses_dec} onChange={v => set('losses_dec', v)} type="number" />
          </div>
        </div>

        <Field label="UFC Debut Date" value={form.ufc_debut_date} onChange={v => set('ufc_debut_date', v)} type="date" />

        <button onClick={save} disabled={saving} style={{
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
        }}>
          {saving ? 'Saving...' : 'Add Fighter'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14 }}
      />
    </div>
  )
}
