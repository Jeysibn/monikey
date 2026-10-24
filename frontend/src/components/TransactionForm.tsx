import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { cn } from 'cn'

import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldError, FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { SegmentedControl } from '@/components/SegmentedControl'
import {
  accountOptionLabel,
  accountsFor,
  amountText,
  notices,
  parseAmount,
  previewFor,
  switchKind,
  validate,
  type EntryField,
  type EntryKind,
  type EntryValues,
} from '@/lib/entryForm'
import { describedBy } from '@/lib/describedBy'
import { cardStatus, isCard } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import type { Account, MockData } from '@/types'

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

function AccountOptions({ accounts, data }: { accounts: Account[]; data: MockData }) {
  const group = (label: string, list: Account[]) =>
    list.length > 0 && (
      <optgroup label={label}>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {accountOptionLabel(a, data)}
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
  data,
  initial,
  amountRef,
  onDirty,
  onSavingChange,
  onSubmit,
  onCancel,
}: {
  data: MockData
  initial: EntryValues
  amountRef: RefObject<HTMLInputElement | null>
  onDirty: () => void // something was typed: the dialog then ignores clicks outside
  onSavingChange: (saving: boolean) => void // the dialog ignores Escape and outside clicks while saving
  onSubmit: (values: EntryValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Set<EntryField>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  // Fields the person has actually changed. Leaving an untouched field shows no error: the message would
  // grow the bottom sheet and push the control the person is tapping out from under their finger.
  const edited = useRef<Set<EntryField>>(new Set())

  const errors = validate(values, data)
  const shown = (field: EntryField) => (submitted || touched.has(field) ? errors[field] : undefined)
  const failing = FIELD_ORDER.filter((f) => errors[f])
  const set = (patch: Partial<EntryValues>, field: EntryField) => {
    edited.current.add(field)
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

  const changeKind = (kind: EntryKind) => {
    onDirty()
    setValues((v) => switchKind(v, kind, data))
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
    setSaving(true)
    onSavingChange(true)
    try {
      await onSubmit(values)
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : FAILED_SAVE)
      setSaving(false)
      onSavingChange(false)
    }
  }

  const card = data.accounts.find((a) => a.id === values.cardId && isCard(a))
  const owed = card ? cardStatus(card, data).owed : 0
  const from = data.accounts.find((a) => a.id === values.accountId)
  const categories = data.categories.filter((c) => c.type === values.kind)
  const preview = previewFor(values, data)
  const warnings = notices(values, data)
  const amountValid = parseAmount(values.amount).ok
  const title = values.kind === 'payment' ? 'Pay credit card' : 'Add transaction'

  const accountError = shown('account')
  const amountError = shown('amount')
  const cardError = shown('card')
  const categoryError = shown('category')
  const dateError = shown('date')
  const noteError = shown('note')
  const accountHelp =
    values.kind === 'expense' && from && isCard(from) ? "Counts as an expense and adds to the card's debt." : undefined
  const cardHelp = card
    ? `Owed now: ${formatPeso(owed)}. No category — payments aren't expenses.`
    : "No category — payments aren't expenses."

  const select = 'h-12 w-full min-w-0 cursor-pointer rounded-control border border-input bg-card pl-3.5 text-base text-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive'

  return (
    <form noValidate onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">Record an expense, income or card payment.</DialogDescription>
      </DialogHeader>

      <DialogBody>
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-4 border-0 p-0">
          {serverError && <InlineNotice tone="error">{serverError}</InlineNotice>}

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

          <SegmentedControl legend="Type" name="qa-kind" value={values.kind} options={KINDS} onChange={changeKind} />
          {values.kind === 'expense' && (
            <p className="-mt-2 text-sm text-muted-foreground">
              Paying a card bill?{' '}
              <button type="button" className="cursor-pointer font-semibold text-primary underline" onClick={() => changeKind('payment')}>
                Use Pay card
              </button>{' '}
              so it isn't counted twice.
            </p>
          )}

          <FormField id="qa-amount" label="Amount" error={amountError}>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-xl font-semibold text-muted-foreground">
                ₱
              </span>
              <Input
                id="qa-amount"
                ref={amountRef}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={values.amount}
                onChange={(e) => set({ amount: e.target.value }, 'amount')}
                onBlur={() => blur('amount')}
                aria-invalid={!!amountError}
                aria-describedby={describedBy('qa-amount', amountError)}
                className="h-14 pl-9 text-2xl font-semibold"
              />
            </div>
          </FormField>
          {values.kind === 'payment' && owed > 0 && (
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
              <AccountOptions accounts={accountsFor(values.kind, 'account', data)} data={data} />
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
                {accountsFor('payment', 'card', data).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — owed {formatPeso(cardStatus(a, data).owed)}
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
                        'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-card px-4 text-[15px] font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed',
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
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="flex-[1.4]" disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Saving…
            </>
          ) : (
            SAVE_LABEL[values.kind]
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
