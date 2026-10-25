import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { cn } from 'cn'

import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/MoneyInput'
import { FieldError, FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { SegmentedControl } from '@/components/SegmentedControl'
import {
  accountOptionLabel,
  accountsFor,
  notices,
  parseAmount,
  previewFor,
  switchKind,
  validate,
  type EntryField,
  type EntryKind,
  type EntryValues,
} from '@/lib/entryForm'
import { SLOW_SAVE_MS, SLOW_SAVE_TEXT, WriteError } from '@/lib/apiErrors'
import { describedBy } from '@/lib/describedBy'
import { isCard } from '@/lib/finance'
import { accountById, cardOf } from '@/lib/snapshot'
import { amountText, formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { AccountInfo, LedgerSnapshot } from '@/types'

/*
 * The Quick Add form (UI_UX_SPEC section 7): expense, income and card payment in one component.
 * It owns what the person typed and shows validation; saving is the parent's job (`onSubmit` resolves
 * on success or rejects with the message to show). While saving, every field is disabled.
 * Errors appear on blur and on submit. A failed submit shows a summary and moves focus to it.
 * The preview and the notices are display-only estimates (see lib/entryForm.ts).
 */
const KINDS: { value: EntryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'payment', label: 'Pay card' },
]
const SAVE_LABEL: Record<EntryKind, string> = { expense: 'Save expense', income: 'Save income', payment: 'Pay credit card' }
const ACCOUNT_LABEL: Record<EntryKind, string> = { expense: 'Account', income: 'Deposit to', payment: 'Pay from' }
const FIELD_ID: Record<EntryField, string> = {
  amount: 'qa-amount',
  account: 'qa-account',
  card: 'qa-card',
  category: 'qa-category-0',
  date: 'qa-date',
  note: 'qa-note',
}
const FIELD_ORDER: EntryField[] = ['amount', 'account', 'card', 'category', 'date', 'note']
const FAILED_SAVE = "Couldn't save. Check your connection and try again. Your entry is still here."

function AccountOptions({ accounts, snapshot, withFigures }: { accounts: AccountInfo[]; snapshot: LedgerSnapshot; withFigures: boolean }) {
  const group = (label: string, list: AccountInfo[]) =>
    list.length > 0 && (
      <optgroup label={label}>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {accountOptionLabel(a, snapshot, withFigures)}
          </option>
        ))}
      </optgroup>
    )
  return (
    <>
      {group('Cash & bank', accounts.filter((a) => a.type === 'cash' || a.type === 'bank'))}
      {group('E-wallet', accounts.filter((a) => a.type === 'ewallet'))}
      {group('Credit cards — adds to debt', accounts.filter(isCard))}
    </>
  )
}

export function TransactionForm({
  mode,
  hidden = false,
  snapshot,
  initial,
  amountRef,
  onDirty,
  onSavingChange,
  onSubmit,
  onCancel,
  onDeleteRequest,
}: {
  mode: 'add' | 'edit'
  hidden?: boolean // the delete confirmation is showing: keep what was typed, show nothing
  snapshot: LedgerSnapshot
  initial: EntryValues
  amountRef: RefObject<HTMLInputElement | null>
  onDirty: () => void // something was typed: the dialog then ignores clicks outside
  onSavingChange: (saving: boolean) => void // the dialog ignores Escape and outside clicks while saving
  onSubmit: (values: EntryValues) => Promise<void>
  onCancel: () => void
  onDeleteRequest: () => void
}) {
  const editing = mode === 'edit'
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Set<EntryField>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // A field the server refused (422) or a message that belongs under a field (409); cleared when that field is edited.
  const [serverField, setServerField] = useState<{ field: EntryField; message: string } | null>(null)
  const slow = useDelayedFlag(saving, SLOW_SAVE_MS)
  const summaryRef = useRef<HTMLDivElement>(null)
  // Fields the person has actually changed. Leaving an untouched field shows no error: the message would
  // grow the bottom sheet and push the control the person is tapping out from under their finger.
  const edited = useRef<Set<EntryField>>(new Set())

  const errors = validate(values, snapshot)
  const shown = (field: EntryField) =>
    (submitted || touched.has(field) ? errors[field] : undefined) ?? (serverField?.field === field ? serverField.message : undefined)
  const failing = FIELD_ORDER.filter((f) => errors[f])
  const set = (patch: Partial<EntryValues>, field: EntryField) => {
    edited.current.add(field)
    if (serverField?.field === field) setServerField(null)
    onDirty()
    setValues((v) => ({ ...v, ...patch }))
  }
  const blur = (field: EntryField) => {
    if (edited.current.has(field)) setTouched((t) => new Set(t).add(field))
  }

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus()
  }, [failedSubmits])

  const focusField = (field: EntryField) => document.getElementById(FIELD_ID[field])?.focus()
  useEffect(() => {
    if (serverField) document.getElementById(FIELD_ID[serverField.field])?.focus() // take the person to the field the server refused
  }, [serverField])

  const changeKind = (kind: EntryKind) => {
    onDirty()
    setValues((v) => switchKind(v, kind, snapshot))
    setTouched((t) => {
      const next = new Set(t)
      next.delete('category')
      next.delete('account')
      return next
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (failing.length > 0) {
      setFailedSubmits((n) => n + 1)
      return
    }
    setServerError(null)
    setServerField(null)
    setSaving(true)
    onSavingChange(true)
    try {
      await onSubmit(values)
    } catch (err) {
      const failure = err instanceof WriteError ? err : new WriteError(FAILED_SAVE)
      const field = FIELD_ORDER.find((f) => f === failure.field)
      setServerError(field && failure.inline ? null : failure.message) // a message under its field is not repeated at the top
      if (field) setServerField({ field, message: failure.inline ? failure.message : 'Check this field.' })
      setSaving(false)
      onSavingChange(false)
    }
  }

  const card = cardOf(snapshot, values.cardId)
  const owed = card?.owed ?? 0
  const from = accountById(snapshot, values.accountId)
  const categories = snapshot.categories.filter((c) => c.type === values.kind)
  // Previews and warnings compare against figures that already include the entry being edited, so edit mode has none.
  const preview = editing ? null : previewFor(values, snapshot)
  const warnings = editing ? [] : notices(values, snapshot)
  const amountValid = parseAmount(values.amount).ok
  const kindWord = values.kind === 'payment' ? 'card payment' : values.kind
  const title = editing ? `Edit ${kindWord}` : values.kind === 'payment' ? 'Pay credit card' : 'Add transaction'
  const saveLabel = editing ? 'Save changes' : SAVE_LABEL[values.kind]

  const accountError = shown('account')
  const amountError = shown('amount')
  const cardError = shown('card')
  const categoryError = shown('category')
  const dateError = shown('date')
  const noteError = shown('note')
  const accountHelp =
    values.kind === 'expense' && from && isCard(from) ? "Counts as an expense and adds to the card's debt." : undefined
  const cardHelp = card && !editing
    ? `Owed now: ${formatPeso(owed)}. No category — payments aren't expenses.`
    : "No category — payments aren't expenses."

  const select = 'h-12 w-full min-w-0 cursor-pointer rounded-control border border-input bg-card pl-3.5 text-base text-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive'

  return (
    <form noValidate hidden={hidden} onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
      {!hidden && (
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {editing ? 'Change this entry, or delete it.' : 'Record an expense, income or card payment.'}
          </DialogDescription>
        </DialogHeader>
      )}

      <DialogBody>
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-4 border-0 p-0">
          {serverError && <InlineNotice tone="error">{serverError}</InlineNotice>}
          {slow && (
            <InlineNotice tone="warning">
              <span role="status">{SLOW_SAVE_TEXT}</span>
            </InlineNotice>
          )}

          {submitted && failing.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-control bg-error-soft px-3.5 py-3 text-sm text-error-ink outline-offset-2">
              <p className="font-semibold">Fix {failing.length} {failing.length === 1 ? 'thing' : 'things'} to save</p>
              <ul className="mt-1 list-disc pl-5">
                {failing.map((f) => (
                  <li key={f}>
                    <button type="button" className="cursor-pointer text-left underline" onClick={() => focusField(f)}>
                      {errors[f]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editing ? (
            <p className="text-sm text-muted-foreground">
              Type: <span className="font-semibold text-foreground">{kindWord.charAt(0).toUpperCase() + kindWord.slice(1)}</span>
            </p>
          ) : (
            <SegmentedControl legend="Type" name="qa-kind" value={values.kind} options={KINDS} onChange={changeKind} />
          )}
          {!editing && values.kind === 'expense' && (
            <p className="-mt-2 text-sm text-muted-foreground">
              Paying a card bill?{' '}
              <button type="button" className="cursor-pointer font-semibold text-primary underline" onClick={() => changeKind('payment')}>
                Use Pay card
              </button>{' '}
              so it isn't counted twice.
            </p>
          )}

          <FormField id="qa-amount" label="Amount" error={amountError}>
            <MoneyInput
              id="qa-amount"
              inputRef={amountRef}
              large
              value={values.amount}
              onChange={(amount) => set({ amount }, 'amount')}
              onBlur={() => blur('amount')}
              invalid={!!amountError}
              describedBy={describedBy('qa-amount', amountError)}
            />
          </FormField>
          {!editing && values.kind === 'payment' && owed > 0 && (
            <Button type="button" variant="secondary" className="-mt-2 w-full" onClick={() => set({ amount: amountText(owed) }, 'amount')}>
              Pay full {formatPeso(owed)}
            </Button>
          )}

          <FormField id="qa-account" label={ACCOUNT_LABEL[values.kind]} error={accountError} helper={accountHelp}>
            <select
              id="qa-account"
              value={values.accountId ?? ''}
              onChange={(e) => set({ accountId: e.target.value === '' ? null : Number(e.target.value) }, 'account')}
              onBlur={() => blur('account')}
              aria-invalid={!!accountError}
              aria-describedby={describedBy('qa-account', accountError, accountHelp)}
              className={select}
            >
              <option value="">{values.kind === 'payment' ? 'Choose where to pay from' : 'Choose an account'}</option>
              <AccountOptions accounts={accountsFor(values.kind, 'account', snapshot)} snapshot={snapshot} withFigures={!editing} />
            </select>
          </FormField>

          {values.kind === 'payment' && (
            <FormField id="qa-card" label="Pay card" error={cardError} helper={cardHelp}>
              <select
                id="qa-card"
                value={values.cardId ?? ''}
                onChange={(e) => set({ cardId: e.target.value === '' ? null : Number(e.target.value) }, 'card')}
                onBlur={() => blur('card')}
                aria-invalid={!!cardError}
                aria-describedby={describedBy('qa-card', cardError, cardHelp)}
                className={select}
              >
                <option value="">Choose a card</option>
                {accountsFor('payment', 'card', snapshot).map((a) => (
                  <option key={a.id} value={a.id}>
                    {editing ? a.name : `${a.name} — owed ${formatPeso(cardOf(snapshot, a.id)?.owed ?? 0)}`}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {values.kind !== 'payment' && (
            <fieldset
              className="m-0 grid min-w-0 gap-1.5 border-0 p-0"
              aria-describedby={describedBy('qa-category', categoryError)}
            >
              <legend className="mb-1.5 text-sm leading-snug font-semibold">Category</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((c, i) => (
                  <label key={c.id} className="relative block">
                    <input
                      id={`qa-category-${i}`}
                      type="radio"
                      name="qa-category"
                      value={c.id}
                      checked={values.categoryId === c.id}
                      onChange={() => set({ categoryId: c.id }, 'category')}
                      onBlur={() => blur('category')}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-card px-4 text-[0.9375rem] font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed',
                        values.categoryId === c.id && 'border-primary bg-primary-soft font-semibold text-primary-ink',
                        categoryError && values.categoryId !== c.id && 'border-destructive',
                      )}
                    >
                      {values.categoryId === c.id && <Check aria-hidden="true" className="size-4" />}
                      {c.name}
                    </span>
                  </label>
                ))}
              </div>
              {categoryError && <FieldError id="qa-category-error" message={categoryError} />}
            </fieldset>
          )}

          {preview && amountValid && (
            <div className="rounded-control bg-secondary px-3.5 py-3 text-sm">
              <p className="font-semibold">{preview.title}</p>
              <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                {preview.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings.map((w) => (
            <InlineNotice key={w} tone="warning">
              {w}
            </InlineNotice>
          ))}

          <FormField id="qa-date" label="Date" error={dateError}>
            <Input
              id="qa-date"
              type="date"
              value={values.date}
              onChange={(e) => set({ date: e.target.value }, 'date')}
              onBlur={() => blur('date')}
              aria-invalid={!!dateError}
              aria-describedby={describedBy('qa-date', dateError)}
            />
          </FormField>

          <FormField id="qa-note" label="Note (optional)" error={noteError}>
            <Input
              id="qa-note"
              autoComplete="off"
              value={values.note}
              onChange={(e) => set({ note: e.target.value }, 'note')}
              onBlur={() => blur('note')}
              aria-invalid={!!noteError}
              aria-describedby={describedBy('qa-note', noteError)}
            />
          </FormField>
        </fieldset>
      </DialogBody>

      <DialogFooter>
        {editing && (
          <Button
            id="qa-delete"
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-error-soft hover:text-error-ink"
            onClick={onDeleteRequest}
            disabled={saving}
          >
            Delete
          </Button>
        )}
        <Button type="button" variant="secondary" className="grow" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="grow-[1.4]" disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Saving…
            </>
          ) : (
            saveLabel
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
