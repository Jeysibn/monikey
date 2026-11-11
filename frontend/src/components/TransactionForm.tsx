import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { cn } from 'cn'

import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/lib/categoryIcons'
import { Input } from '@/components/ui/input'
import { AccountPicker } from '@/components/AccountPicker'
import { DateShortcuts } from '@/components/DateShortcuts'
import { MoneyInput } from '@/components/MoneyInput'
import { FieldError, FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { SegmentedControl } from '@/components/SegmentedControl'
import { EnvelopePicker } from '@/components/kakeibo/EnvelopePicker'
import {
  accountsFor,
  categoriesForTransaction,
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
import { suggestedEnvelope } from '@/lib/kakeibo'
import { accountById, cardOf } from '@/lib/snapshot'
import { amountText, formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { LedgerSnapshot } from '@/types'

/*
 * The Quick Add form (UI_UX_SPEC section 7): expense, income and card payment in one component.
 * It owns what the person typed and shows validation; saving is the parent's job (`onSubmit` resolves
 * on success or rejects with the message to show). While saving, every field is disabled.
 * Errors appear on blur and on submit. A failed submit shows a summary and moves focus to it.
 * The preview and the notices are display-only estimates (see lib/entryForm.ts).
 * An expense also gets a Kakeibo envelope (ADR-021) when the server supports it. A new expense follows its
 * category's suggested envelope until the person picks one themselves; after that, changing the category never
 * replaces their choice. An entry being edited keeps its stored envelope (even "not classified") unless the
 * person changes it.
 */
const KINDS: { value: EntryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'payment', label: 'Pay card' },
  { value: 'transfer', label: 'Transfer' },
]
const SAVE_LABEL: Record<EntryKind, string> = { expense: 'Save expense', income: 'Save income', payment: 'Pay credit card', transfer: 'Save transfer' }
const ACCOUNT_LABEL: Record<EntryKind, string> = { expense: 'Account', income: 'Deposit to', payment: 'Pay from', transfer: 'Transfer from' }
const FIELD_ID: Record<EntryField, string> = {
  amount: 'qa-amount',
  account: 'qa-account',
  card: 'qa-card',
  destination: 'qa-destination',
  category: 'qa-category-0',
  envelope: 'qa-envelope-0',
  date: 'qa-date',
  note: 'qa-note',
}
// The order of the form on screen: the error summary lists problems in this order too.
const FIELD_ORDER: EntryField[] = ['amount', 'date', 'account', 'destination', 'card', 'category', 'envelope', 'note']
const FAILED_SAVE = "Couldn't save. Check your connection and try again. Your entry is still here."

export function TransactionForm({
  mode,
  hidden = false,
  snapshot,
  today,
  recentAccountId,
  recentPayFromId,
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
  today: string // the Asia/Manila calendar date, for the Today and Yesterday shortcuts
  recentAccountId: number | null // the account used last in this session, listed first in the picker
  recentPayFromId: number | null // the same for "Pay from" on a card payment
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
  // True once the envelope is the person's own choice. A stored entry's envelope already is.
  const envelopeChosen = useRef(editing)

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
    envelopeChosen.current = false
    setValues((v) => switchKind(v, kind, snapshot))
    setTouched((t) => {
      const next = new Set(t)
      next.delete('category')
      next.delete('account')
      next.delete('card')
      next.delete('destination')
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
  const transferAccounts = accountsFor('transfer', 'account', snapshot)
  const transferHelp = transferAccounts.length < 2
    ? 'Add another cash, bank, or e-wallet account first.'
    : 'Transfers between your accounts do not count as income or expenses.'
  const categories = values.kind === 'income' || values.kind === 'expense'
    ? categoriesForTransaction(values.kind, snapshot, editing ? values.categoryId : null)
    : []
  // Previews and warnings compare against figures that already include the entry being edited, so edit mode has none.
  const preview = editing ? null : previewFor(values, snapshot)
  const warnings = editing ? [] : notices(values, snapshot)
  const amountValid = parseAmount(values.amount).ok
  const kindWord = values.kind === 'payment' ? 'card payment' : values.kind
  const title = editing ? `Edit ${kindWord}` : values.kind === 'payment' ? 'Pay credit card' : values.kind === 'transfer' ? 'Transfer money' : 'Add transaction'
  const saveLabel = editing ? 'Save changes' : SAVE_LABEL[values.kind]

  const accountError = shown('account')
  const amountError = shown('amount')
  const cardError = shown('card')
  const destinationError = shown('destination')
  const categoryError = shown('category')
  const dateError = shown('date')
  const noteError = shown('note')
  const accountHelp =
    values.kind === 'expense' && from && isCard(from) ? "Counts as an expense and adds to the card's debt." : undefined
  const cardHelp = card && !editing
    ? `Owed now: ${formatPeso(owed)}. No category — payments aren't expenses.`
    : "No category — payments aren't expenses."

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

          <FormField id="qa-date" label="Date" error={dateError}>
            <DateShortcuts today={today} value={values.date} disabled={saving} onPick={(date) => set({ date }, 'date')} />
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

          <FormField id="qa-account" label={ACCOUNT_LABEL[values.kind]} error={accountError} helper={accountHelp}>
            <AccountPicker
              id="qa-account"
              accounts={accountsFor(values.kind, 'account', snapshot)}
              snapshot={snapshot}
              value={values.accountId}
              recentId={editing ? null : values.kind === 'payment' ? recentPayFromId : recentAccountId}
              withFigures={!editing}
              placeholder={values.kind === 'payment' ? 'Choose where to pay from' : values.kind === 'transfer' ? 'Choose a source account' : 'Choose an account'}
              invalid={!!accountError}
              describedBy={describedBy('qa-account', accountError, accountHelp)}
              onChange={(accountId) => set({ accountId }, 'account')}
              onBlur={() => blur('account')}
            />
          </FormField>

          {values.kind === 'payment' && (
            <FormField id="qa-card" label="Pay card" error={cardError} helper={cardHelp}>
              <AccountPicker
                id="qa-card"
                accounts={accountsFor('payment', 'card', snapshot)}
                snapshot={snapshot}
                value={values.cardId}
                withFigures={!editing}
                placeholder="Choose a card"
                invalid={!!cardError}
                describedBy={describedBy('qa-card', cardError, cardHelp)}
                onChange={(cardId) => set({ cardId }, 'card')}
                onBlur={() => blur('card')}
              />
            </FormField>
          )}

          {values.kind === 'transfer' && (
            <FormField id="qa-destination" label="Transfer to" error={destinationError} helper={transferHelp}>
              <AccountPicker
                id="qa-destination"
                accounts={transferAccounts.filter((a) => a.id !== values.accountId)}
                snapshot={snapshot}
                value={values.destinationAccountId}
                withFigures={!editing}
                placeholder="Choose a destination account"
                invalid={!!destinationError}
                describedBy={describedBy('qa-destination', destinationError, transferHelp)}
                onChange={(destinationAccountId) => set({ destinationAccountId }, 'destination')}
                onBlur={() => blur('destination')}
              />
            </FormField>
          )}

          {values.kind !== 'payment' && values.kind !== 'transfer' && (
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
                      onChange={() => {
                        // Until the person picks an envelope, a new expense follows the category's suggestion.
                        const follow = values.kind === 'expense' && values.envelope !== undefined && !envelopeChosen.current
                        set({ categoryId: c.id, ...(follow ? { envelope: suggestedEnvelope(snapshot.categories, c.id) } : {}) }, 'category')
                      }}
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
                      <CategoryIcon iconKey={c.iconKey} className="size-4" />
                      {c.name}
                    </span>
                  </label>
                ))}
              </div>
              {categoryError && <FieldError id="qa-category-error" message={categoryError} />}
            </fieldset>
          )}

          {values.kind === 'expense' && values.envelope !== undefined && (
            <EnvelopePicker
              value={values.envelope}
              suggestion={suggestedEnvelope(snapshot.categories, values.categoryId)}
              categoryName={snapshot.categories.find((c) => c.id === values.categoryId)?.name ?? null}
              error={shown('envelope')}
              onChange={(envelope) => {
                envelopeChosen.current = true
                set({ envelope }, 'envelope')
              }}
              onBlur={() => blur('envelope')}
            />
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
