import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WidgetFrame, type WidgetFrameProps } from './WidgetFrame'

afterEach(cleanup)

function renderFrame(overrides: Partial<WidgetFrameProps> = {}) {
  const props: WidgetFrameProps = {
    id: 'projection',
    span: 8,
    editing: false,
    drop: null,
    onResize: vi.fn(),
    onRemove: vi.fn(),
    children: <p>chart goes here</p>,
    ...overrides,
  }
  return { ...render(<WidgetFrame {...props} />), props }
}

describe('WidgetFrame', () => {
  it('shows the widget title and body with no edit controls outside edit mode', () => {
    renderFrame()
    expect(screen.getByRole('heading', { name: 'Projeção' })).toBeTruthy()
    expect(screen.getByText('chart goes here')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remover Projeção' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Largura de Projeção' })).toBeNull()
  })

  it('in edit mode shows the size control with the current span pressed, and a remove button', () => {
    const { props } = renderFrame({ editing: true })
    const sizes = screen.getByRole('group', { name: 'Largura de Projeção' })
    expect(within(sizes).getByRole('button', { name: 'XL', pressed: true })).toBeTruthy()
    fireEvent.click(within(sizes).getByRole('button', { name: 'L' }))
    expect(props.onResize).toHaveBeenCalledWith(6)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Projeção' }))
    expect(props.onRemove).toHaveBeenCalledOnce()
  })

  it('makes the frame focusable and inerts its body in edit mode', () => {
    renderFrame({ editing: true })
    const frame = screen.getByRole('group', { name: 'Projeção' })
    expect(frame.getAttribute('tabindex')).toBe('0')
    expect(frame.getAttribute('data-widget-frame')).toBe('projection')
    const hint = document.getElementById(frame.getAttribute('aria-describedby') ?? '')
    expect(hint?.textContent).toContain('Alt+setas move, Alt+Shift+setas redimensionam, Delete remove')
    expect(screen.getByText('chart goes here').parentElement?.hasAttribute('inert')).toBe(true)
  })

  it('draws a before mark for a narrow cell as a vertical bar on the left edge', () => {
    const { container } = renderFrame({ editing: true, drop: { side: 'before', axis: 'x' } })
    const mark = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(mark?.className).toContain('-left-2')
    expect(mark?.className).toContain('w-[3px]')
  })

  it('draws an after mark for a full-width cell as a horizontal bar at the bottom', () => {
    const { container } = renderFrame({ editing: true, drop: { side: 'after', axis: 'y' } })
    const mark = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(mark?.className).toContain('-bottom-[7px]')
    expect(mark?.className).toContain('h-[3px]')
  })
})
