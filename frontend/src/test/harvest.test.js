import { describe, it, expect, beforeEach } from 'vitest'
import { useHarvestStore, useInventoryStore } from '../store'

describe('Harvest Store', () => {
  beforeEach(() => {
    // Reset stores before each test
    useHarvestStore.setState({
      activeHarvests: {},
      treeStates: {},
    })
    useInventoryStore.setState({
      items: [],
    })
  })

  it('should start a harvest', () => {
    const { startHarvest } = useHarvestStore.getState()
    
    startHarvest('tree1', 'player1', 5)
    
    const state = useHarvestStore.getState()
    expect(state.activeHarvests['tree1']).toBeDefined()
    expect(state.activeHarvests['tree1'].playerId).toBe('player1')
    expect(state.activeHarvests['tree1'].duration).toBe(5000) // converted to milliseconds
  })

  it('should complete a harvest', () => {
    const { startHarvest, completeHarvest } = useHarvestStore.getState()
    
    // Start harvest first
    startHarvest('tree1', 'player1', 5)
    
    // Complete harvest
    completeHarvest('tree1')
    
    const state = useHarvestStore.getState()
    expect(state.activeHarvests['tree1']).toBeUndefined()
    expect(state.treeStates['tree1']).toBeDefined()
    expect(state.treeStates['tree1'].isHarvestable).toBe(false)
  })

  it('should check if tree is harvestable', () => {
    const { isTreeHarvestable } = useHarvestStore.getState()

    // New tree should be harvestable
    expect(isTreeHarvestable('tree1')(useHarvestStore.getState())).toBe(true)

    // Tree with active harvest should not be harvestable
    useHarvestStore.getState().startHarvest('tree1', 'player1', 5)
    expect(isTreeHarvestable('tree1')(useHarvestStore.getState())).toBe(false)
  })

  it('should handle harvest timeouts', (done) => {
    const { startHarvest } = useHarvestStore.getState()
    const treeId = 'tree_timeout'
    const playerId = 'player_1'
    const duration = 0.1 // Very short duration for testing

    // Start harvest
    startHarvest(treeId, playerId, duration)

    // Get fresh state after starting harvest
    let state = useHarvestStore.getState()

    // Should have active harvest
    expect(state.activeHarvests[treeId]).toBeDefined()
    expect(state.activeHarvests[treeId].timeoutId).toBeDefined()

    // Wait for timeout to trigger (duration + 5 second grace period)
    setTimeout(() => {
      const newState = useHarvestStore.getState()
      // Harvest should be cancelled due to timeout
      expect(newState.activeHarvests[treeId]).toBeUndefined()
      done()
    }, (duration + 5.1) * 1000)
  })

  it('should clear timeouts when completing harvest', () => {
    const { startHarvest, completeHarvest } = useHarvestStore.getState()
    const treeId = 'tree_complete'
    const playerId = 'player_1'

    // Start harvest
    startHarvest(treeId, playerId, 5)

    // Get fresh state after starting harvest
    let state = useHarvestStore.getState()

    // Should have active harvest with timeout
    expect(state.activeHarvests[treeId]).toBeDefined()
    expect(state.activeHarvests[treeId].timeoutId).toBeDefined()

    // Complete harvest
    completeHarvest(treeId)

    // Should no longer have active harvest
    const newState = useHarvestStore.getState()
    expect(newState.activeHarvests[treeId]).toBeUndefined()
  })
})

describe('Inventory Store', () => {
  beforeEach(() => {
    useInventoryStore.setState({
      items: [],
    })
  })

  it('should add items to inventory', () => {
    const { addItem } = useInventoryStore.getState()

    addItem({
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
    })

    const state = useInventoryStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].type).toBe('berry')
    expect(state.items[0].subType).toBe('blueberry')
    expect(state.items[0].name).toBe('Blueberry')
  })

  it('should stack items of the same type and subType', () => {
    const { addItem } = useInventoryStore.getState()

    // Add first blueberry
    addItem({
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
    })

    // Add second blueberry - should stack
    addItem({
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
    })

    const state = useInventoryStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].quantity).toBe(2)
  })

  it('should not stack different berry types', () => {
    const { addItem } = useInventoryStore.getState()

    // Add blueberry
    addItem({
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
    })

    // Add strawberry - should not stack
    addItem({
      type: 'berry',
      subType: 'strawberry',
      name: 'Strawberry',
      quantity: 1,
    })

    const state = useInventoryStore.getState()
    expect(state.items).toHaveLength(2)
    expect(state.items[0].subType).toBe('blueberry')
    expect(state.items[1].subType).toBe('strawberry')
  })

  it('should remove items from inventory', () => {
    const { addItem, removeItem } = useInventoryStore.getState()

    // Add item first
    addItem({
      type: 'berry',
      name: 'Berry',
      quantity: 1,
    })

    const state = useInventoryStore.getState()
    const itemId = state.items[0].id

    // Remove item
    removeItem(itemId)

    const newState = useInventoryStore.getState()
    expect(newState.items).toHaveLength(0)
  })

  it('should clear entire inventory', () => {
    const { addItem, clearInventory } = useInventoryStore.getState()

    // Add multiple items
    addItem({ type: 'berry', subType: 'blueberry', name: 'Blueberry', quantity: 5 })
    addItem({ type: 'berry', subType: 'strawberry', name: 'Strawberry', quantity: 3 })

    let state = useInventoryStore.getState()
    expect(state.items).toHaveLength(2)

    // Clear inventory
    clearInventory()

    state = useInventoryStore.getState()
    expect(state.items).toHaveLength(0)
  })

  it('should track validation timing', () => {
    const { shouldValidate, markValidated } = useInventoryStore.getState()

    // Should validate initially
    expect(shouldValidate()).toBe(true)

    // Mark as validated
    markValidated()

    // Should not need validation immediately after
    expect(shouldValidate()).toBe(false)
  })
})
