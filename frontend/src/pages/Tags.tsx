import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/Card'
import { useBackendAuthOptional } from '../components/BackendAuthContext'
import './Tags.css'

type Tag = { id: string; name: string }
export function Tags() {
  const backend = useBackendAuthOptional(); const [tags, setTags] = useState<Tag[]>([]); const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (backend) fetch('/api/v1/tags', { credentials: 'include' }).then((r) => r.json()).then(setTags).catch(() => setError('Could not load tags.')) }, [backend])
  async function add(event: React.FormEvent) { event.preventDefault(); const response = await fetch('/api/v1/tags', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }); const tag = await response.json(); if (!response.ok) { setError(tag.error?.message ?? 'Could not create tag.'); return } setTags((current) => [...current.filter((item) => item.id !== tag.id), tag].sort((a, b) => a.name.localeCompare(b.name))); setName('') }
  async function remove(id: string) { const response = await fetch(`/api/v1/tags/${id}`, { method: 'DELETE', credentials: 'include' }); if (response.ok) setTags((current) => current.filter((tag) => tag.id !== id)) }
  if (!backend) return <Card><CardTitle>Tags</CardTitle><p className="faint">Tag management is available in backend mode.</p></Card>
  return <div className="page-stack"><div className="page-head"><div><p className="eyebrow">Track</p><h1 className="page-title">Tags</h1><p className="page-subtitle">Add context to transactions without changing their category.</p></div></div><Card><CardTitle>Create tag</CardTitle><form className="inline-form" onSubmit={add}><label className="sr-only" htmlFor="tag-name">Tag name</label><input id="tag-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="reimbursable" required maxLength={64} /><button className="btn btn--primary" type="submit">Add tag</button></form>{error && <p role="alert" className="tx-error">{error}</p>}</Card><Card><CardTitle>Your tags</CardTitle><div className="chip-list">{tags.map((tag) => <span className="chip" key={tag.id}>#{tag.name}<button type="button" aria-label={`Delete ${tag.name}`} onClick={() => void remove(tag.id)}>×</button></span>)}</div></Card></div>
}
