import { describe, it, expect, beforeEach } from 'vitest'
import { useHUDStore } from '../store'

describe('HUD Store', () => {
  beforeEach(() => {
    useHUDStore.setState({
      isVisible: true,
      position: { x: 20, y: 20 },
      quickUseSlots: [null, null, null],
      isDragging: false,
    })
  })

  it('should initialize with default values', () => {
    const state = useHUDStore.getState()
    expect(state.isVisible).toBe(true)
    expect(state.position).toEqual({ x: 20, y: 20 })
    expect(state.quickUseSlots).toEqual([null, null, null])
    expect(state.isDragging).toBe(false)
  })

  it('should toggle visibility', () => {
    const { toggleVisibility } = useHUDStore.getState()
    
    toggleVisibility()
    expect(useHUDStore.getState().isVisible).toBe(false)
    
    toggleVisibility()
    expect(useHUDStore.getState().isVisible).toBe(true)
  })

  it('should set visibility directly', () => {
    const { setVisible } = useHUDStore.getState()
    
    setVisible(false)
    expect(useHUDStore.getState().isVisible).toBe(false)
    
    setVisible(true)
    expect(useHUDStore.getState().isVisible).toBe(true)
  })

  it('should update position', () => {
    const { setPosition } = useHUDStore.getState()
    const newPosition = { x: 100, y: 200 }
    
    setPosition(newPosition)
    expect(useHUDStore.getState().position).toEqual(newPosition)
  })

  it('should set quick use slot items', () => {
    const { setQuickUseSlot } = useHUDStore.getState()
    const testItem = {
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
      id: 'test-id'
    }
    
    setQuickUseSlot(0, testItem)
    const state = useHUDStore.getState()
    expect(state.quickUseSlots[0]).toEqual(testItem)
    expect(state.quickUseSlots[1]).toBe(null)
    expect(state.quickUseSlots[2]).toBe(null)
  })

  it('should clear quick use slot', () => {
    const { setQuickUseSlot, clearQuickUseSlot } = useHUDStore.getState()
    const testItem = {
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
      id: 'test-id'
    }
    
    // Set item first
    setQuickUseSlot(1, testItem)
    expect(useHUDStore.getState().quickUseSlots[1]).toEqual(testItem)
    
    // Clear it
    clearQuickUseSlot(1)
    expect(useHUDStore.getState().quickUseSlots[1]).toBe(null)
  })

  it('should handle multiple quick use slots independently', () => {
    const { setQuickUseSlot } = useHUDStore.getState()
    const item1 = { type: 'berry', subType: 'blueberry', name: 'Blueberry', id: '1' }
    const item2 = { type: 'berry', subType: 'strawberry', name: 'Strawberry', id: '2' }
    const item3 = { type: 'berry', subType: 'greenberry', name: 'Greenberry', id: '3' }
    
    setQuickUseSlot(0, item1)
    setQuickUseSlot(1, item2)
    setQuickUseSlot(2, item3)
    
    const state = useHUDStore.getState()
    expect(state.quickUseSlots[0]).toEqual(item1)
    expect(state.quickUseSlots[1]).toEqual(item2)
    expect(state.quickUseSlots[2]).toEqual(item3)
  })

  it('should set dragging state', () => {
    const { setDragging } = useHUDStore.getState()
    
    setDragging(true)
    expect(useHUDStore.getState().isDragging).toBe(true)
    
    setDragging(false)
    expect(useHUDStore.getState().isDragging).toBe(false)
  })
})
