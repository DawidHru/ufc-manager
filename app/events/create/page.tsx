'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CreateEventPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    event_date: '',
    event_type: 'Fight Night' as 'PPV' | 'Fight Night',
    location: '',
    ppv_number: '',
  })

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function save() {
    if (!form.name || !form.event_date) return alert('Name and date are required')
    setSaving(true)
    const { data, error } = await supabase.from('events').insert({
      name: form.name.trim(),
      event_date: form.event_date,
      event_type: form.event_type,
      location: form.location.trim() || null,
      ppv_number: form.ppv_number ? Number(form.ppv_number) : null,
      status: 'scheduled',
    }).select().single()

    if (error) {
      alert('Error: ' + error.message)
    } else {
      router.push(`/events/${data.id}`)
    }
    setSaving(false)
  }

  return (
    <div style={{ padding: 32, maxWidth: 560 }}>
      <button onClick={() => router.back()} style={{
        background: 'none', border: 'none', color: 'var(--muted)',
        cursor: 'pointer', fontSize: 14, marginBottom: 24, padding: 0,
      }}>← Back</button>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28 }}>Create Event</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label="Event Name *" value={form.name} onChange={v => set('name', v)} placeholder="UFC Fight Night: Smith vs Jones" />
        <Field label="Date *" value={form.event_date} onChange={v => set('event_date', v)} type="date" />

        <div>
          <label style={labelStyle}>Event Type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['Fight Night', 'PPV'] as const).map(t => (
              <button key={t} onClick={() => set('event_type', t)} style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid',
                borderColor: form.event_type === t ? 'var(--accent)' : 'var(--border)',
                background: form.event_type === t ? 'var(--accent)' : 'var(--surface)',
                color: form.event_type === t ? '#fff' : 'var(--foreground)',
                cursor: 'pointer', fontWeight: 600, fontSize: 14,
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {form.event_type === 'PPV' && (
          <Field label="PPV Number" value={form.ppv_number} onChange={v => set('ppv_number', v)} type="number" placeholder="e.g. 300" />
        )}

        <Field label="Location" value={form.location} onChange={v => set('location', v)} placeholder="Las Vegas, NV" />

        <button onClick={save} disabled={saving} style={{
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, marginTop: 8,
        }}>
          {saving ? 'Creating...' : 'Create Event'}
        </button>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--muted)', display: 'block',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em',
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', fontSize: 14 }} />
    </div>
  )
}
