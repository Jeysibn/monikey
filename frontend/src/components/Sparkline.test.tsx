import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'

describe('Sparkline', () => {
  it('renders normally for a multi-point series', () => {
    const { container } = render(<Sparkline values={[10, 12, 8, 15]} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('does not throw and renders a flat line for an empty series (regression: fresh-portfolio Investments page crash)', () => {
    expect(() => render(<Sparkline values={[]} />)).not.toThrow()
    const { container } = render(<Sparkline values={[]} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('does not throw and renders a single point for a one-value series', () => {
    expect(() => render(<Sparkline values={[42]} />)).not.toThrow()
    const { container } = render(<Sparkline values={[42]} />)
    const path = container.querySelector('path')
    expect(path?.getAttribute('d')).not.toContain('NaN')
  })
})
