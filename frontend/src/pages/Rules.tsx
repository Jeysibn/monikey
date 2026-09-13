import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/Card'
import { useBackendAuthOptional } from '../components/BackendAuthContext'
import './Rules.css'

type Rule = { id: string; name: string; enabled: boolean; priority: number; conditions: Record<string, unknown>; actions: Record<string, unknown> }
const initial = { name: '', merchantContains: '', normalizedMerchant: '', addTags: '', note: '' }

export function Rules() {
  const backend = useBackendAuthOptional()
  const [rules, setRules] = useState<Rule[]>([])
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!backend) return; fetch('/api/v1/rules', { credentials: 'include' }).then((r) => r.json()).then((body: Rule[]) => setRules(body)).catch(() => setError('Could not load transaction rules.')) }, [backend])
  async function createRule(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    if (!form.name.trim() || !form.merchantContains.trim()) { setError('Name and merchant condition are required.'); return }
    if (!backend) { setError('Rules are available in backend mode.'); return }
    const response = await fetch('/api/v1/rules', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: form.name.trim(), conditions: { merchantContains: form.merchantContains.trim() }, actions: { normalizedMerchant: form.normalizedMerchant.trim() || undefined, addTags: form.addTags.split(',').map((tag) => tag.trim()).filter(Boolean), note: form.note.trim() || undefined } }) })
    if (!response.ok) { setError('Could not save rule.'); return }
    const created = await response.json() as Rule
    setRules((current) => [...current, created]); setForm(initial)
  }
  async function remove(id: string) { if (!backend) return; await fetch(`/api/v1/rules/${id}`, { method: 'DELETE', credentials: 'include' }); setRules((current) => current.filter((rule) => rule.id !== id)) }
  return <div className="rules-page"><div className="page-head"><div><p className="eyebrow">Automate</p><h1 className="page-title">Transaction rules</h1></div></div><Card><CardTitle>Create a rule</CardTitle><p className="form-help">Rules run during import in priority order. They never change balances or call AI.</p><form className="rules-form" onSubmit={createRule}><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jollibee normalization" /></label><label>Merchant contains<input value={form.merchantContains} onChange={(e) => setForm({ ...form, merchantContains: e.target.value })} placeholder="JOLLIBEE" /></label><label>Normalize merchant to<input value={form.normalizedMerchant} onChange={(e) => setForm({ ...form, normalizedMerchant: e.target.value })} placeholder="Jollibee" /></label><label>Add tags <span className="faint">comma separated</span><input value={form.addTags} onChange={(e) => setForm({ ...form, addTags: e.target.value })} placeholder="fast-food, work" /></label><label>Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional note" /></label>{error && <p role="alert" className="tx-error">{error}</p>}<button className="btn btn--primary" type="submit">Save rule</button></form></Card><Card><CardTitle>Saved rules</CardTitle>{rules.length === 0 ? <p className="faint">No rules yet.</p> : <ul className="rules-list">{rules.map((rule) => <li key={rule.id}><div><strong>{rule.name}</strong><small>When merchant contains “{String(rule.conditions.merchantContains ?? '')}”</small></div><button className="btn btn--ghost btn--compact" type="button" onClick={() => void remove(rule.id)}>Delete</button></li>)}</ul>}</Card></div>
}
