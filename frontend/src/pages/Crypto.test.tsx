import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Crypto } from './Crypto'

afterEach(cleanup)

describe('Crypto page', () => {
  it('renders the truthful tracker framing and deterministic mock coins', () => {
    render(<Crypto />)
    expect(screen.getByRole('heading', { name: 'Crypto Portfolio' })).toBeDefined()
    expect(screen.getByText(/never sends an order/i)).toBeDefined()
    expect(screen.getByText('Bitcoin')).toBeDefined()
    expect(screen.getByText('Ethereum')).toBeDefined()
  })

  it('can switch to backend-derived chart and transaction views', () => {
    render(<Crypto />)
    fireEvent.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(screen.getByRole('heading', { name: 'Portfolio History' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }))
    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeDefined()
    expect(screen.getByText(/No crypto transactions/)).toBeDefined()
  })

  it('opens a truthful transaction dialog for an already tracked mock coin', () => {
    render(<Crypto />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Transaction' })[0]!)
    expect(screen.getByRole('dialog', { name: 'Bitcoin' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'TRANSFER' })).toBeDefined()
    fireEvent.click(screen.getByRole('tab', { name: 'TRANSFER' }))
    expect(screen.getByText('Network fee (BTC)')).toBeDefined()
  })

  it('calculates a crypto quantity from an entered amount and price', () => {
    render(<Crypto />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Transaction' })[0]!)
    fireEvent.change(screen.getByLabelText('Price per BTC'), { target: { value: '6400000' } })
    fireEvent.change(screen.getByLabelText('I spent / received (PHP)'), { target: { value: '10000' } })
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('0.0015625')
  })

  it('opens a coin detail drawer with held-location information', () => {
    render(<Crypto />)
    fireEvent.click(screen.getByRole('button', { name: 'Bitcoin' }))
    expect(screen.getByRole('dialog', { name: 'Bitcoin' })).toBeDefined()
    expect(screen.getByText('Where held')).toBeDefined()
    expect(screen.getByText('Binance')).toBeDefined()
  })
})
