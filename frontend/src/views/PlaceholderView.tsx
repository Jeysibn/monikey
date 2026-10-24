import { PageHeader } from '@/components/PageHeader'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

/*
 * Stand-in for Activity and Accounts until they are built. It keeps the page title (an h1),
 * the header and the navigation working so the shell can be used and tested end to end.
 */
export function PlaceholderView({
  title,
  message,
  onAdd,
  addDisabled,
}: {
  title: string
  message: string
  onAdd: () => void
  addDisabled: boolean
}) {
  return (
    <>
      <PageHeader title={title} onAdd={onAdd} addDisabled={addDisabled} />
      <Card>
        <CardTitle>Coming in a later milestone</CardTitle>
        <CardDescription>{message}</CardDescription>
      </Card>
    </>
  )
}
