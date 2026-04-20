'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSimId } from '@/lib/sim'

const ALLOWED_OPERATIONS = ['INSERT']
const ALLOWED_TABLES = ['fighters', 'events', 'fights', 'rankings', 'p4p_rankings', 'feuds']

interface QueryResult {
  success: boolean
  message: string
  rowsAffected?: number
  data?: any[]
}

function validateSQL(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim().toUpperCase()

  // Allow only INSERT
  if (!trimmed.startsWith('INSERT')) {
    return { valid: false, error: 'Only INSERT statements are allowed.' }
  }

  // Block dangerous keywords
  const blocked = ['DROP', 'DELETE', 'UPDATE', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', '--', '/*']
  for (const kw of blocked) {
    if (trimmed.includes(kw)) {
      return { valid: false, error: `Keyword "${kw}" is not allowed.` }
    }
  }

  return { valid: true }
}

const EXAMPLE_SQL = `-- Add multiple fighters at once
INSERT INTO fighters (first_name, last_name, nickname, nationality, age, primary_division, style, wins, losses, draws, wins_ko, wins_sub, wins_dec, losses_ko, losses_sub, losses_dec, hype_score, dominance_score, contract_fights_remaining, current_streak)
VALUES
  ('Islam', 'Makhachev', 'The Eagle Jr', 'Russia', 32, 'Lightweight', 'Wrestler', 26, 1, 0, 4, 10, 12, 0, 1, 0, 90, 88, 4, 5),
  ('Dustin', 'Poirier', 'The Diamond', 'USA', 35, 'Lightweight', 'Striker', 30, 9, 0, 14, 7, 9, 3, 4, 2, 82, 70, 4, -1),
  ('Justin', 'Gaethje', 'The Highlight', 'USA', 35, 'Lightweight', 'Striker', 25, 5, 0, 19, 1, 5, 0, 4, 1, 85, 72, 4, 1);`

export default function CommandsPage() {
  const [sql, setSQL] = useState(EXAMPLE_SQL)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)

  async function runSQL() {
    const statements = sql
      .split(';')
      .map(s =>
        s.split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim()
      )
      .filter(s => s.length > 0)

    if (statements.length === 0) return

    const validation = validateSQL(statements.join(';'))
    if (!validation.valid) {
      setResult({ success: false, message: validation.error! })
      return
    }

    setRunning(true)
    setResult(null)

    let totalRows = 0
    let errors: string[] = []

    for (const stmt of statements) {
      if (!stmt) continue

      const validation = validateSQL(stmt)
      if (!validation.valid) {
        errors.push(validation.error!)
        continue
      }

      if (stmt.toUpperCase().trimStart().startsWith('SELECT')) {
        // SELECT not supported via RPC in this setup — use INSERT only
        errors.push('SELECT via command panel is not supported. Use INSERT statements only.')
      } else {
        // Parse INSERT manually for safety
        try {
          const res = await executeInsert(stmt)
          if (res.error) errors.push(res.error)
          else totalRows += res.count ?? 0
        } catch (e: any) {
          errors.push(e.message)
        }
      }
    }

    if (errors.length > 0) {
      setResult({ success: false, message: errors.join('\n') })
    } else {
      setResult({ success: true, message: `Done. ${totalRows} row(s) inserted.`, rowsAffected: totalRows })
    }

    setRunning(false)
  }

  async function executeInsert(stmt: string): Promise<{ error?: string; count?: number }> {
    // Extract table name
    const tableMatch = stmt.match(/INSERT\s+INTO\s+(\w+)/i)
    if (!tableMatch) return { error: 'Could not parse table name' }
    const tableName = tableMatch[1].toLowerCase()

    if (!ALLOWED_TABLES.includes(tableName)) {
      return { error: `Table "${tableName}" is not allowed for insert.` }
    }

    // Extract columns
    const colMatch = stmt.match(/\(([^)]+)\)\s*VALUES/i)
    if (!colMatch) return { error: 'Could not parse columns' }
    const columns = colMatch[1].split(',').map(c => c.trim())

    // Extract values (handle multiple rows)
    const valuesIdx = stmt.toUpperCase().indexOf('VALUES')
    const valuesSection = stmt.slice(valuesIdx + 6).trim()
    const rows = parseValuesRows(valuesSection)

    if (rows.length === 0) return { error: 'No values found' }

    const simId = getSimId()
    const records = rows.map(row => {
      const obj: Record<string, any> = {}
      columns.forEach((col, i) => {
        let val: any = row[i]
        if (val === 'NULL' || val === null) { obj[col] = null; return }
        if (!isNaN(Number(val)) && val !== '') obj[col] = Number(val)
        else obj[col] = val
      })
      if (simId) obj.sim_id = simId
      return obj
    })

    const { error, count } = await (supabase as any)
      .from(tableName)
      .insert(records)
      .select()

    if (error) return { error: error.message }
    return { count: records.length }
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Command Panel</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
        Only <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>INSERT</code> statements are allowed.
        Use this to bulk import fighters or data.
      </p>

      {/* Allowed tables info */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13,
      }}>
        <span style={{ color: 'var(--muted)' }}>Allowed tables: </span>
        {ALLOWED_TABLES.map(t => (
          <code key={t} style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4, margin: '0 3px', fontSize: 12 }}>{t}</code>
        ))}
      </div>

      {/* Editor */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <textarea
          value={sql}
          onChange={e => setSQL(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            height: 320,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            color: 'var(--foreground)',
            fontSize: 13,
            fontFamily: 'Consolas, Monaco, monospace',
            lineHeight: 1.6,
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={runSQL} disabled={running} style={{
          background: 'var(--accent)', border: 'none', color: '#fff',
          padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
          cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.7 : 1,
        }}>
          {running ? 'Running...' : '▶ Run'}
        </button>
        <button onClick={() => { setSQL(''); setResult(null) }} style={{
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
          padding: '10px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
        }}>
          Clear
        </button>
        <button onClick={() => setSQL(EXAMPLE_SQL)} style={{
          background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
          padding: '10px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
        }}>
          Load Example
        </button>
      </div>

      {/* Result */}
      {result && (
        <div style={{
          background: result.success ? '#22c55e11' : '#ef444411',
          border: `1px solid ${result.success ? '#22c55e44' : '#ef444444'}`,
          borderRadius: 10, padding: '14px 18px',
        }}>
          <div style={{
            fontWeight: 700, fontSize: 14,
            color: result.success ? 'var(--green)' : 'var(--red)',
            marginBottom: result.message ? 6 : 0,
          }}>
            {result.success ? '✓ Success' : '✗ Error'}
          </div>
          {result.message && (
            <pre style={{ margin: 0, fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {result.message}
            </pre>
          )}
        </div>
      )}

      {/* Reference */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Fighters Table Columns</h2>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden', fontSize: 12,
        }}>
          {[
            ['first_name', 'TEXT', 'Required'],
            ['last_name', 'TEXT', 'Required'],
            ['nickname', 'TEXT', 'Optional'],
            ['nationality', 'TEXT', 'Optional'],
            ['age', 'INT', 'Optional'],
            ['primary_division', 'TEXT', 'Flyweight / Bantamweight / Featherweight / Lightweight / Welterweight / Middleweight / Light Heavyweight / Heavyweight'],
            ['style', 'TEXT', 'Striker / Wrestler / Grappler / All-around'],
            ['wins / losses / draws', 'INT', 'Default 0'],
            ['wins_ko / wins_sub / wins_dec', 'INT', 'Default 0'],
            ['losses_ko / losses_sub / losses_dec', 'INT', 'Default 0'],
            ['hype_score', 'NUMERIC', '0-100, default 50'],
            ['dominance_score', 'NUMERIC', '0-100, default 50'],
            ['current_streak', 'INT', 'Positive = win streak, negative = loss streak'],
            ['contract_fights_remaining', 'INT', 'Default 4'],
            ['ufc_debut_date', 'DATE', 'YYYY-MM-DD, optional'],
          ].map(([col, type, desc], i, arr) => (
            <div key={col} style={{
              display: 'grid', gridTemplateColumns: '220px 100px 1fr',
              padding: '9px 16px', gap: 12,
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center',
            }}>
              <code style={{ color: 'var(--accent)' }}>{col}</code>
              <span style={{ color: 'var(--muted)' }}>{type}</span>
              <span style={{ color: 'var(--muted)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rankings reference */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Rankings Insert</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          After inserting fighters, insert their rankings separately. Fighter ID is visible in the roster URL.
        </p>
        <pre style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 16, fontSize: 12, fontFamily: 'Consolas, Monaco, monospace',
          color: 'var(--foreground)', overflowX: 'auto', margin: '0 0 16px',
        }}>{`INSERT INTO rankings (fighter_id, division, rank, snapshot_date) VALUES
  (1, 'Lightweight', 1, '2020-01-04'),
  (2, 'Lightweight', 2, '2020-01-04'),
  (3, 'Lightweight', 3, '2020-01-04');`}</pre>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
          {[
            ['fighter_id', 'INT', 'ID from the fighters table (visible in roster URL /roster/123)'],
            ['division', 'TEXT', 'Flyweight / Bantamweight / Featherweight / Lightweight / Welterweight / Middleweight / Light Heavyweight / Heavyweight'],
            ['rank', 'INT', '1–15 for contenders. Champion is set on fighters table (is_champion, champion_division).'],
            ['snapshot_date', 'DATE', 'YYYY-MM-DD — use simulation start date for initial import'],
          ].map(([col, type, desc], i, arr) => (
            <div key={col} style={{
              display: 'grid', gridTemplateColumns: '160px 60px 1fr',
              padding: '9px 16px', gap: 12,
              borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              alignItems: 'center',
            }}>
              <code style={{ color: 'var(--accent)' }}>{col}</code>
              <span style={{ color: 'var(--muted)' }}>{type}</span>
              <span style={{ color: 'var(--muted)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Parse VALUES rows like ('a', 1, NULL), ('b', 2, NULL)
function parseValuesRows(valuesStr: string): string[][] {
  const rows: string[][] = []
  let depth = 0
  let current = ''
  let inStr = false
  let strChar = ''
  let values: string[] = []
  let i = 0

  while (i < valuesStr.length) {
    const ch = valuesStr[i]

    if (!inStr && (ch === "'" || ch === '"')) {
      inStr = true; strChar = ch; current += ch
    } else if (inStr && ch === strChar) {
      inStr = false; current += ch
    } else if (!inStr && ch === '(') {
      if (depth === 0) { current = ''; values = [] }
      else current += ch
      depth++
    } else if (!inStr && ch === ')') {
      depth--
      if (depth === 0) {
        values.push(parseValue(current.trim()))
        rows.push(values)
        values = []; current = ''
      } else current += ch
    } else if (!inStr && ch === ',' && depth === 1) {
      values.push(parseValue(current.trim()))
      current = ''
    } else {
      current += ch
    }
    i++
  }
  return rows
}

function parseValue(val: string): string {
  if (val.toUpperCase() === 'NULL') return 'NULL'
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    return val.slice(1, -1)
  }
  return val
}
