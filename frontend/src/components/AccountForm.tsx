import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { MoneyInput } from '@/components/MoneyInput'
import { SegmentedControl } from '@/components/SegmentedControl'
import { isCardType, MAX_NAME, validateAccount, type AccountField, type AccountValues } from '@/lib/accountForm'
import { describedBy } from '@/lib/describedBy'
import type { AccountType, MockData } from '@/types'

/*
 * The Add account form (UI_UX_SPEC section 9). Same habits as the Quick Add form: errors appear when a
 * field the person has edited is left, and for every field on submit; a failed submit shows a summary and
 * moves focus to it; while saving every field is disabled; a failed save keeps everything typed.
 * The labels are plain words; the API's names (opening_balance, opening_debt, credit_limit) stay in lib/accountForm.ts.
 */
const TYPES: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'credit_card', label: 'Card' },
]
const NAME_EXAMPLE: Record<AccountType, string> = { cash: 'Cash on hand', bank: 'Main Savings', ewallet: 'GCash', credit_card: 'Blue Card' }
const FIELD_ID: Record<AccountField, string> = { name: 'aa-name', balance: 'aa-balance', limit: 'aa-limit', owed: 'aa-owed' }
const FIELD_ORDER: AccountField[] = ['name', 'balance', 'limit', 'owed']
const FAILED_SAVE = "Couldn't save. Check your connection and try again. Your entry is still here."

export function AccountForm({
  data,
  initial,
  nameRef,
  onDirty,
  onSavingChange,
  onSubmit,
  onCancel,
}: {
  data: MockData
  initial: AccountValues
  nameRef: RefObject<HTMLInputElement | null>
  onDirty: () => void
  onSavingChange: (saving: boolean) => void
  onSubmit: (values: AccountValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Set<AccountField>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const edited = useRef<Set<AccountField>>(new Set()) // see TransactionForm: leaving an untouched field shows nothing

  const errors = validateAccount(values, data)
  const shown = (field: AccountField) => (submitted || touched.has(field) ? errors[field] : undefined)
  const failing = FIELD_ORDER.filter((f) => errors[f])
  const card = isCardType(values.type)

  const set = (patch: Partial<AccountValues>, field?: AccountField) => {
    if (field) edited.current.add(field)
    onDirty()
    setValues((v) => ({ ...v, ...patch }))
  }
  const blur = (field: AccountField) => {
    if (edited.current.has(field)) setTouched((t) => new Set(t).add(field))
  }

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus()
  }, [failedSubmits])

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

  const nameError = shown('name')
  const balanceError = shown('balance')
  const limitError = shown('limit')
  const owedError = shown('owed')
  const balanceHelp = "What's in it right now."
  const limitHelp = 'The most the bank lets you charge.'
  const owedHelp = 'What you still owe on this card today. Use 0.00 if nothing.'

  return (
    <form noValidate onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>Add account</DialogTitle>
        <DialogDescription className="sr-only">Add a cash, bank, e-wallet or credit card account.</DialogDescription>
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
                    <button type="button" className="cursor-pointer text-left underline" onClick={() => document.getElementById(FIELD_ID[f])?.focus()}>
                      {errors[f]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <SegmentedControl legend="Type" name="aa-type" value={values.type} options={TYPES} onChange={(type) => set({ type })} />

          <FormField id="aa-name" label="Name" error={nameError} helper={`Up to ${MAX_NAME} characters.`}>
            <Input
              id="aa-name"
              ref={nameRef}
              autoComplete="off"
              placeholder={NAME_EXAMPLE[values.type]}
              value={values.name}
              onChange={(e) => set({ name: e.target.value }, 'name')}
              onBlur={() => blur('name')}
              aria-invalid={!!nameError}
              aria-describedby={describedBy('aa-name', nameError, true)}
            />
          </FormField>

          {card ? (
            <>
              <FormField id="aa-limit" label="Credit limit (₱)" error={limitError} helper={limitHelp}>
                <MoneyInput
                  id="aa-limit"
                  value={values.limit}
                  onChange={(limit) => set({ limit }, 'limit')}
                  onBlur={() => blur('limit')}
                  invalid={!!limitError}
                  describedBy={describedBy('aa-limit', limitError, limitHelp)}
                />
              </FormField>
              <FormField id="aa-owed" label="Amount you owe today (₱)" error={owedError} helper={owedHelp}>
                <MoneyInput
                  id="aa-owed"
                  value={values.owed}
                  onChange={(owed) => set({ owed }, 'owed')}
                  onBlur={() => blur('owed')}
                  invalid={!!owedError}
                  describedBy={describedBy('aa-owed', owedError, owedHelp)}
                />
              </FormField>
            </>
          ) : (
            <FormField id="aa-balance" label="Current balance (₱)" error={balanceError} helper={balanceHelp}>
              <MoneyInput
                id="aa-balance"
                value={values.balance}
                onChange={(balance) => set({ balance }, 'balance')}
                onBlur={() => blur('balance')}
                invalid={!!balanceError}
                describedBy={describedBy('aa-balance', balanceError, balanceHelp)}
              />
            </FormField>
          )}
        </fieldset>
      </DialogBody>

      <DialogFooter>
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
            'Add account'
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
