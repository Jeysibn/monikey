import { useEffect } from 'react'

import { AnalysisSection } from '@/components/dashboard/AnalysisSection'
import { ReportingSection } from '@/components/dashboard/ReportingSection'
import { MokiTip } from '@/components/MokiTip'
import { PageHeader } from '@/components/PageHeader'
import type { DataSource } from '@/dataSource'
import type { AccountsSnapshot, AddState } from '@/types'
import type { Resource } from '@/useResource'

/*
 * Dashboard (ADR-024, ADR-025): the analytics page, separate from Overview. Two sections with two independent date
 * scopes. The monthly summary follows its own Reporting Month; the spending analysis follows its own date range.
 * Each reads its own report from the server, so changing one can never move the other's figures. Charts are native
 * SVG with a data table for every chart.
 */
export function DashboardView({ today, source, accounts, version, onAdd, addState }: {
  today: string
  source: DataSource
  accounts: Resource<AccountsSnapshot>
  version: number
  onAdd: () => void
  addState: AddState
}) {
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus()
  }, [])

  return (
    <div className="grid gap-8 md:gap-10">
      <PageHeader title="Dashboard" mascot="presenting" onAdd={onAdd} addState={addState}>
        <p className="w-full text-sm text-muted-foreground md:w-auto md:max-w-80">Understand where your money went, from your recorded transactions.</p>
      </PageHeader>
      <MokiTip id="dashboard-scopes" pose="presenting" title="Two views, two date scopes">
        The monthly summary follows the month you pick. The charts below have their own date range and account filter, and never change the monthly figures.
      </MokiTip>
      <ReportingSection today={today} source={source} version={version} />
      <AnalysisSection today={today} source={source} version={version} accounts={accounts} />
    </div>
  )
}
