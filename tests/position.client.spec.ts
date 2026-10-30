/**
 * Geometry is the quiet failure mode of a movable widget: a dock that can be
 * dragged somewhere its panel cannot follow looks broken even though nothing
 * threw. These cases pin the edges, the flip, and the narrow viewport.
 */

import { describe, expect, it } from 'vitest'
import { clampPosition, defaultPosition, placePopover } from '../src/client/position.ts'

const DESKTOP = { width: 1200, height: 800 }

describe('defaultPosition', () => {
  it('keeps the old top-right perch on a desktop viewport', () => {
    expect(defaultPosition(1200)).toEqual({ right: 16, top: 56 })
  })

  it('tightens the margin on a phone-sized viewport', () => {
    expect(defaultPosition(420)).toEqual({ right: 12, top: 12 })
  })
})

describe('clampPosition', () => {
  it('leaves a position that already fits alone', () => {
    expect(clampPosition({ right: 16, top: 56 }, DESKTOP)).toEqual({ right: 16, top: 56 })
  })

  it('lets a wide viewport put the dock near its left edge', () => {
    const position = clampPosition({ right: 1152, top: 300 }, DESKTOP)
    expect(position).toEqual({ right: 1152, top: 300 })
    expect(placePopover(position, DESKTOP).align).toBe('start')
  })

  it('pins a narrow viewport to the edge where the panel still fits', () => {
    expect(clampPosition({ right: 200, top: 100 }, { width: 400, height: 700 }))
      .toEqual({ right: 20, top: 100 })
  })

  it('keeps the dock wholly inside the viewport vertically', () => {
    expect(clampPosition({ right: 16, top: 999 }, DESKTOP)).toEqual({ right: 16, top: 752 })
    expect(clampPosition({ right: 16, top: -40 }, DESKTOP)).toEqual({ right: 16, top: 8 })
  })
})

describe('placePopover', () => {
  it('opens down and to the left by default', () => {
    expect(placePopover({ right: 16, top: 56 }, DESKTOP)).toEqual({
      align: 'end',
      side: 'below',
      maxHeight: 560,
    })
  })

  it('uses the room it has when the dock sits low', () => {
    const below = placePopover({ right: 16, top: 400 }, DESKTOP)
    expect(below.side).toBe('below')
    expect(below.maxHeight).toBe(338)
  })

  it('flips above when below would be too short', () => {
    const placed = placePopover({ right: 16, top: 700 }, DESKTOP)
    expect(placed.side).toBe('above')
    expect(placed.maxHeight).toBe(560)
  })

  it('never grows past a comfortable panel', () => {
    expect(placePopover({ right: 16, top: 56 }, { width: 1200, height: 1400 }).maxHeight).toBe(560)
  })
})
