import { useEffect, useState, type FormEvent } from 'react'
import { Card, CardTitle } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { useConfirm } from '../hooks/useConfirm'
import { useBackendAuthOptional } from '../components/BackendAuthContext'
import type { paths } from '../api.generated'
import './Tags.css'

type Tag = paths['/tags']['get']['responses'][200]['content']['application/json'][number]
type CreateTagRequest = paths['/tags']['post']['requestBody']['content']['application/json']
type TagError = paths['/transactions/{id}/tags']['get']['responses'][404]['content']['application/json']
export function Tags() {
  const backend = useBackendAuthOptional(); const [tags, setTags] = useState<Tag[]>([]); const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null); const { confirm, dialog: confirmDialog } = useConfirm()
  useEffect(() => { if (backend) fetch('/api/v1/tags', { credentials: 'include' }).then(async (response) => { if (!response.ok) throw new Error('tags unavailable'); return response.json() as Promise<Tag[]> }).then(setTags).catch(() => setError('Could not load tags.')) }, [backend])
  async function add(event: FormEvent) { event.preventDefault(); setError(null); const payload: CreateTagRequest = { name }; const response = await fetch('/api/v1/tags', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const body = await response.json() as Tag | TagError; if (!response.ok) { setError('error' in body ? body.error.message : 'Could not create tag.'); return } const tag = body as Tag; setTags((current) => [...current.filter((item) => item.id !== tag.id), tag].sort((a, b) => a.name.localeCompare(b.name))); setName('') }
  async function remove(id: string, tagName: string) { if (!await confirm({ title: 'Delete tag?', message: `Delete “${tagName}”? Existing transactions will lose this tag.`, confirmLabel: 'Delete tag' })) return; const response = await fetch(`/api/v1/tags/${id}`, { method: 'DELETE', credentials: 'include' }); if (response.ok) setTags((current) => current.filter((tag) => tag.id !== id)); else setError('Could not delete tag.') }
  return <div className="page-stack tags-page"><PageHeader eyebrow="Manage" title="Tags" description="Add context to transactions without changing their category." />{!backend ? <Card><CardTitle>Tag management</CardTitle><p className="faint">Tag management is available in backend mode.</p></Card> : <><Card><CardTitle>Create tag</CardTitle><form className="inline-form" onSubmit={add}><label className="sr-only" htmlFor="tag-name">Tag name</label><input id="tag-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="reimbursable" required maxLength={64} /><button className="btn btn--primary" type="submit">Add tag</button></form>{error && <p role="alert" className="tx-error">{error}</p>}</Card><Card><CardTitle>Your tags</CardTitle><div className="chip-list">{tags.length === 0 ? <p className="faint">No tags yet.</p> : tags.map((tag) => <span className="chip" key={tag.id}>#{tag.name}<button type="button" aria-label={`Delete ${tag.name}`} onClick={() => void remove(tag.id, tag.name)}>×</button></span>)}</div></Card></>}{confirmDialog}</div>
}
