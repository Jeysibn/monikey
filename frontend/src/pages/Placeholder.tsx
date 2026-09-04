import { Card } from '../components/Card'

export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
      </div>
      <Card style={{ alignItems: 'center', textAlign: 'center', padding: '48px 24px', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title} is coming soon</div>
        <p className="faint" style={{ margin: 0, maxWidth: 360 }}>
          This section isn&apos;t built yet. It&apos;s next in the product's build order — see the Monikey project
          docs for the full sequence.
        </p>
      </Card>
    </div>
  )
}
