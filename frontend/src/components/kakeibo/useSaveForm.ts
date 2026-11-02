import { useState, type FormEvent } from 'react'

import { SLOW_SAVE_MS, WriteError } from '@/lib/apiErrors'
import { useDelayedFlag } from '@/useDelayedFlag'

/*
 * The save habits every MoniKey form shares, for the Kakeibo reflection forms: errors show once an edited field
 * is left and for every field on submit; while saving, `saving` is true (the form disables its fields and Save,
 * so nothing is sent twice); a failed save keeps everything typed and shows the message, and marks the field the
 * server refused. `slow` turns on after 15 seconds of waiting.
 */
export function useSaveForm<V extends { [K in keyof V]: string }>({
  initial,
  validate,
  onSubmit,
  onSavingChange,
  onDirty,
  failMessage,
  idOf,
}: {
  initial: V
  validate: (values: V) => Partial<Record<keyof V, string>>
  onSubmit: (values: V) => Promise<void>
  onSavingChange: (saving: boolean) => void
  onDirty: () => void
  failMessage: string
  idOf: (field: keyof V) => string // the element id of a field, so focus can go to the first invalid one
}) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Set<keyof V>>(new Set())
  const [edited] = useState(() => new Set<keyof V>())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverField, setServerField] = useState<keyof V | null>(null)
  const slow = useDelayedFlag(saving, SLOW_SAVE_MS)
  const errors = validate(values)
  const invalid = (Object.keys(errors) as (keyof V)[]).filter((field) => errors[field])

  const shown = (field: keyof V): string | undefined =>
    (submitted || touched.has(field) ? errors[field] : undefined) ?? (serverField === field ? 'Check this field.' : undefined)
  const set = (field: keyof V, value: string) => {
    edited.add(field)
    if (serverField === field) setServerField(null)
    onDirty()
    setValues((v) => ({ ...v, [field]: value }))
  }
  const blur = (field: keyof V) => {
    if (edited.has(field)) setTouched((t) => new Set(t).add(field))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (invalid.length > 0) {
      document.getElementById(idOf(invalid[0]))?.focus()
      return
    }
    setServerError(null)
    setServerField(null)
    setSaving(true)
    onSavingChange(true)
    try {
      await onSubmit(values)
    } catch (err) {
      const failure = err instanceof WriteError ? err : new WriteError(failMessage)
      setServerError(failure.message)
      const field = (Object.keys(values) as (keyof V)[]).find((f) => f === failure.field)
      if (field) setServerField(field)
      setSaving(false)
      onSavingChange(false)
    }
  }

  return { values, set, blur, shown, saving, slow, serverError, submit }
}
