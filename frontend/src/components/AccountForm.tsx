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
import { SLOW_SAVE_MS, SLOW_SAVE_TEXT, WriteError } from '@/lib/apiErrors'
import { describedBy } from '@/lib/describedBy'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { AccountType, LedgerSnapshot } from '@/types'

/*
 * The Add/Edit account form (UI_UX_SPEC section 9). Same habits as the Quick Add form: errors appear when a
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
const FAILED_ADD = "Couldn't save. Check your connection and try again. Your account details are still here."
const FAILED_EDIT = "Couldn't save. Check your connection and try again. Your changes are still here."

export function AccountForm({
  mode,
  excludeAccountId,
  snapshot,
  initial,
  nameRef,
  onDirty,
  onSavingChange,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit'
  excludeAccountId?: number
  snapshot: LedgerSnapshot
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
  // A field the server refused (422) or a message that belongs under a field (409); cleared when that field is edited.
  const [serverField, setServerField] = useState<{ field: AccountField; message: string } | null>(null)
  const slow = useDelayedFlag(saving, SLOW_SAVE_MS)
  const summaryRef = useRef<HTMLDivElement>(null)
  const edited = useRef<Set<AccountField>>(new Set()) // see TransactionForm: leaving an untouched field shows nothing

  const errors = validateAccount(values, snapshot, excludeAccountId)
  const shown = (field: AccountField) =>
    (submitted || touched.has(field) ? errors[field] : undefined) ?? (serverField?.field === field ? serverField.message : undefined)
  const failing = FIELD_ORDER.filter((f) => errors[f])
  const card = isCardType(values.type)

  const set = (patch: Partial<AccountValues>, field?: AccountField) => {
    if (field) edited.current.add(field)
    if (field && serverField?.field === field) setServerField(null)
    onDirty()
    setValues((v) => ({ ...v, ...patch }))
  }
  const blur = (field: AccountField) => {
    if (edited.current.has(field)) setTouched((t) => new Set(t).add(field))
  }

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus()
  }, [failedSubmits])
  useEffect(() => {
    if (serverField) document.getElementById(FIELD_ID[serverField.field])?.focus() // take the person to the field the server refused
  }, [serverField])

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
      const failure = err instanceof WriteError ? err : new WriteError(mode === 'edit' ? FAILED_EDIT : FAILED_ADD)
      const field = FIELD_ORDER.find((f) => f === failure.field)
      setServerError(field && failure.inline ? null : failure.message) // a message under its field is not repeated at the top
      if (field) setServerField({ field, message: failure.inline ? failure.message : 'Check this field.' })
      setSaving(false)
      onSavingChange(false)
    }
  }

  const nameError = shown('name')
  const balanceError = shown('balance')
  const limitError = shown('limit')
  const owedError = shown('owed')
  const balanceHelp = mode === 'edit'
    ? 'Changing this resets the starting amount. Past activity stays unchanged.'
    : "What's in it right now."
  const limitHelp = 'The most the bank lets you charge.'
  const owedHelp = mode === 'edit'
    ? 'Changing this resets the starting debt. Past purchases and payments stay unchanged.'
    : 'What you still owe on this card today. Use 0.00 if nothing.'

  return (
    <form noValidate onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{mode === 'edit' ? 'Edit account' : 'Add account'}</DialogTitle>
        <DialogDescription className="sr-only">
          {mode === 'edit' ? 'Edit this account name and opening amounts. Its type cannot be changed.' : 'Add a cash, bank, e-wallet or credit card account.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-4 border-0 p-0">
          {serverError && <InlineNotice tone="error">{serverError}</InlineNotice>}
          {slow && (
            <InlineNotice tone="warning">
              <span role="status">{SLOW_SAVE_TEXT}</span>
            </InlineNotice>
          )}

          {mode === 'edit' && (
            <InlineNotice tone="warning">
              Changing an opening amount recalculates today&rsquo;s balance or debt. Existing transactions and payments stay unchanged.
            </InlineNotice>
          )}

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

          {mode === 'add' ? (
            <SegmentedControl legend="Type" name="aa-type" value={values.type} options={TYPES} onChange={(type) => set({ type })} />
          ) : (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Account type</span>
              <span className="text-base text-muted-foreground">{TYPES.find((option) => option.value === values.type)?.label}</span>
            </div>
          )}

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
              <FormField id="aa-owed" label={mode === 'edit' ? 'Opening debt (₱)' : 'Amount you owe today (₱)'} error={owedError} helper={owedHelp}>
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
            <FormField id="aa-balance" label={mode === 'edit' ? 'Opening balance (₱)' : 'Current balance (₱)'} error={balanceError} helper={balanceHelp}>
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
            mode === 'edit' ? 'Save changes' : 'Add account'
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
