'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { SimulationConfig } from '@/lib/database.types'

type Screen = 'home' | 'load' | 'new'

export default function StartScreen() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('home')
  const [sims, setSims] = useState<SimulationConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [simName, setSimName] = useState('')
  const [startDate, setStartDate] = useState('2020-01-04')
  const [creating, setCreating] = useState(false)

  async function loadSims() {
    setLoading(true)
    setScreen('load')
    const { data } = await supabase.from('simulation_config').select('*').order('created_at', { ascending: false })
    setSims(data ?? [])
    setLoading(false)
  }

  function selectSim(sim: SimulationConfig) {
    localStorage.setItem('simId', String(sim.id))
    router.push('/dashboard')
  }

  async function createSim() {
    if (!startDate) return
    setCreating(true)
    const { data, error } = await supabase
      .from('simulation_config')
      .insert({
        name: simName.trim() || null,
        start_date: startDate,
        sim_date: startDate,
      })
      .select()
      .single()

    if (data) {
      localStorage.setItem('simId', String(data.id))
      router.push('/dashboard')
    } else {
      alert('Error: ' + error?.message)
      setCreating(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--background)',
      padding: 32,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{ fontSize: 13, letterSpacing: '0.3em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
          UFC
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          MANAGER
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 14, letterSpacing: '0.05em' }}>
          Simulation · Strategy · Control
        </div>
      </div>

      {screen === 'home' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <OptionCard
            title="Wczytaj symulację"
            desc="Kontynuuj istniejącą symulację"
            onClick={loadSims}
          />
          <OptionCard
            title="Nowa symulacja"
            desc="Zacznij od wybranej daty"
            onClick={() => setScreen('new')}
            primary
          />
        </div>
      )}

      {screen === 'load' && (
        <div style={{ width: '100%', maxWidth: 520 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
            Wybierz symulację
          </h2>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>Ładowanie...</div>
          ) : sims.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 24, padding: '24px 0' }}>
              Brak zapisanych symulacji.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {sims.map(sim => (
                <button key={sim.id} onClick={() => selectSim(sim)} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '16px 20px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--foreground)', textAlign: 'left', width: '100%',
                  transition: 'border-color 0.15s',
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {sim.name ?? `Symulacja #${sim.id}`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      Start: {new Date(sim.start_date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Aktualna data sim</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                      {new Date(sim.sim_date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setScreen('home')} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 20px', color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
            }}>
              Wróć
            </button>
            <button onClick={() => setScreen('new')} style={{
              background: 'var(--accent)', border: 'none', borderRadius: 8,
              padding: '10px 20px', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>
              Nowa symulacja
            </button>
          </div>
        </div>
      )}

      {screen === 'new' && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Nowa symulacja</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28, lineHeight: 1.6, textAlign: 'center' }}>
            Wybierz datę startową. Od niej będą liczone eventy i rankingi.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
            <div>
              <label style={labelStyle}>Nazwa symulacji</label>
              <input
                type="text"
                placeholder="np. UFC 2020 — moja pierwsza sim"
                value={simName}
                onChange={e => setSimName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Data rozpoczęcia *</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setScreen('home')} style={{
              flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px', color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
            }}>
              Wróć
            </button>
            <button onClick={createSim} disabled={creating || !startDate} style={{
              flex: 2, background: 'var(--accent)', border: 'none', borderRadius: 8,
              padding: '12px', color: '#fff', cursor: creating ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700, opacity: creating ? 0.7 : 1,
            }}>
              {creating ? 'Tworzenie...' : 'Rozpocznij symulację'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--muted)', display: 'block',
  marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '12px 14px', color: 'var(--foreground)', fontSize: 15,
  boxSizing: 'border-box',
}

function OptionCard({ title, desc, onClick, primary }: {
  title: string; desc: string; onClick: () => void; primary?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      background: primary ? 'var(--accent)' : 'var(--surface)',
      border: primary ? 'none' : '1px solid var(--border)',
      borderRadius: 14, padding: '28px 40px', cursor: 'pointer',
      textAlign: 'center', color: primary ? '#fff' : 'var(--foreground)',
      minWidth: 200, transition: 'opacity 0.15s',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.75 }}>{desc}</div>
    </button>
  )
}
