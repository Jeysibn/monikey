import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useFieldErrors } from './useFieldErrors'

// Vitest runs without `globals`, so Testing Library's automatic cleanup hook
// is never registered — unmount between tests explicitly.
afterEach(cleanup)

const FIELDS = ['name', 'amount'] as const
type Field = (typeof FIELDS)[number]

/** A minimal stand-in for the real forms, wired exactly the way they wire it. */
function Harness() {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const { errors, field, errorId, fail } = useFieldErrors<Field>(FIELDS)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next: Partial<Record<Field, string>> = {}
    if (!name.trim()) next.name = 'Name is required.'
    if (!amount.trim()) next.amount = 'Amount is required.'
    if (Object.keys(next).length > 0) fail(next)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <input aria-label="Name" value={name} {...field('name', (e) => setName(e.target.value))} />
      {errors.name && (
        <p role="alert" id={errorId('name')}>
          {errors.name}
        </p>
      )}
      <input aria-label="Amount" value={amount} {...field('amount', (e) => setAmount(e.target.value))} />
      {errors.amount && (
        <p role="alert" id={errorId('amount')}>
          {errors.amount}
        </p>
      )}
      <button type="submit">Save</button>
    </form>
  )
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('useFieldErrors (TR-009)', () => {
  it('marks each invalid control and links it to its own message', () => {
    render(<Harness />)
    submit()

    const name = screen.getByLabelText('Name')
    const amount = screen.getByLabelText('Amount')

    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(amount.getAttribute('aria-invalid')).toBe('true')

    // Each control points at ITS OWN message, not a shared paragraph.
    const nameErrorId = name.getAttribute('aria-describedby')!
    const amountErrorId = amount.getAttribute('aria-describedby')!
    expect(nameErrorId).not.toBe(amountErrorId)
    expect(document.getElementById(nameErrorId)!.textContent).toBe('Name is required.')
    expect(document.getElementById(amountErrorId)!.textContent).toBe('Amount is required.')
  })

  it('focuses the first invalid control in declared order, not the last', () => {
    render(<Harness />)
    submit()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
  })

  it('focuses the first STILL-invalid control once an earlier field is corrected', () => {
    render(<Harness />)
    submit()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Groceries' } })
    submit()
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'))
  })

  // The regression this hook exists to prevent: an error that outlives the
  // mistake. Before this, five of six forms kept aria-invalid="true" and the
  // visible message on a corrected field until the next submit.
  it('clears a field’s error as soon as that field is edited', () => {
    render(<Harness />)
    submit()

    const name = screen.getByLabelText('Name')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByRole('alert')).toHaveLength(2)

    fireEvent.change(name, { target: { value: 'Groceries' } })

    expect(name.getAttribute('aria-invalid')).toBeNull()
    expect(name.getAttribute('aria-describedby')).toBeNull()
    expect(screen.queryByText('Name is required.')).toBeNull()
  })

  it('clears only the edited field, leaving other errors announced', () => {
    render(<Harness />)
    submit()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Groceries' } })

    // The untouched field is still invalid and still announced.
    expect(screen.getByLabelText('Amount').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Amount is required.')).toBeDefined()
  })

  it('still delegates to the caller’s own change handler', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Groceries' } })
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Groceries')
  })
})
