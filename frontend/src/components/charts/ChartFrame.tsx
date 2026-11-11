import { useId, useState, type ReactNode } from 'react'
import { Table2 } from 'lucide-react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/*
 * The shared frame around every Dashboard chart (ADR-025): a visible title and one-line description, optional
 * controls, the chart itself, a legend that names every series and (where it helps) its figure, a polite live
 * "readout" line for the value a person points at, and the equivalent data table.
 * The table is always in the page for assistive technology; "Show data table" reveals it for everyone, so the
 * same numbers are available without the picture. Charts are `aria-hidden` inside the frame: the title, the
 * readout and the table carry the meaning.
 */
export interface LegendItem {
  label: string
  color: string
  value?: string // the figure for this series, when the legend doubles as a summary
  hatched?: boolean // drawn with a hatch pattern (a partial period), so it is not told apart by color alone
}

export interface ChartTable {
  caption: string
  columns: string[]
  rows: string[][]
}

export function ChartFrame({
  title,
  description,
  actions,
  legend,
  table,
  empty,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  legend?: LegendItem[]
  table: ChartTable
  empty?: string // shown instead of the chart and table when there is nothing to draw
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <Card role="region" aria-labelledby={`${id}-title`} className={cn('grid min-w-0 content-start gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-base leading-tight font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>

      {empty ? (
        <p className="rounded-control bg-surface-raised px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          {children}
          {legend && legend.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-sm" aria-label={`${title} legend`}>
              {legend.map((item) => (
                <li key={item.label} className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: item.color, ...(item.hatched ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.75) 0 2px, transparent 2px 4px)' } : {}) }}
                  />
                  <span className="min-w-0">
                    {item.label}
                    {item.value && <span className="text-muted-foreground"> · {item.value}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 min-h-11 px-2 text-primary"
              aria-expanded={open}
              aria-controls={`${id}-table`}
              onClick={() => setOpen((o) => !o)}
            >
              <Table2 aria-hidden="true" />
              {open ? 'Hide data table' : 'Show data table'}
            </Button>
            <div id={`${id}-table`} className={cn(!open && 'sr-only')}>
              <div className="max-h-80 overflow-auto rounded-control border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">{table.caption}</caption>
                  <thead className="sticky top-0 bg-secondary">
                    <tr>
                      {table.columns.map((column, i) => (
                        <th key={column} scope="col" className={cn('px-3 py-2 font-semibold', i > 0 && 'text-right')}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={row[0]} className="border-t border-border">
                        {row.map((cell, i) => (i === 0 ? <th key={i} scope="row" className="px-3 py-2 font-medium">{cell}</th> : <td key={i} className="px-3 py-2 text-right tabular-nums">{cell}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

/** The live line under a chart: what is at the pointed or focused position. Polite, so it never interrupts. */
export function Readout({ text, hint }: { text: string | null; hint: string }) {
  return (
    <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
      {text ?? hint}
    </p>
  )
}
