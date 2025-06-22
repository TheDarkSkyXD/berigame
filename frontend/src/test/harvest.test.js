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
    // Reset to proper 28-slot array
    const { clearInventory } = useInventoryStore.getState()
    clearInventory()
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
    expect(state.items).toHaveLength(28) // Fixed array size
    expect(state.items[0]).not.toBeNull()
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
    expect(state.items).toHaveLength(28) // Fixed array size
    expect(state.items[0]).not.toBeNull()
    expect(state.items[0].quantity).toBe(2)
    // Check that only one slot is used
    const nonNullItems = state.items.filter(item => item !== null)
    expect(nonNullItems).toHaveLength(1)
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
    expect(state.items).toHaveLength(28) // Fixed array size
    expect(state.items[0]).not.toBeNull()
    expect(state.items[1]).not.toBeNull()
    expect(state.items[0].subType).toBe('blueberry')
    expect(state.items[1].subType).toBe('strawberry')
    // Check that exactly two slots are used
    const nonNullItems = state.items.filter(item => item !== null)
    expect(nonNullItems).toHaveLength(2)
  })

  it('should remove items from inventory', () => {
    const { addItem, removeItem } = useInventoryStore.getState()

    // Add item first
    addItem({
      type: 'berry',
      subType: 'blueberry', // Add subType to avoid issues
      name: 'Blueberry',
      quantity: 1,
    })

    const state = useInventoryStore.getState()
    expect(state.items[0]).not.toBeNull() // Ensure item was added
    const itemId = state.items[0].id

    // Remove item
    removeItem(itemId)

    const newState = useInventoryStore.getState()
    // With slot-based approach, removing an item sets it to null
    expect(newState.items[0]).toBeNull()
    // Check that no items remain (filter out nulls)
    const nonNullItems = newState.items.filter(item => item !== null)
    expect(nonNullItems).toHaveLength(0)
  })

  it('should clear entire inventory', () => {
    const { addItem, clearInventory } = useInventoryStore.getState()

    // Add multiple items
    addItem({ type: 'berry', subType: 'blueberry', name: 'Blueberry', quantity: 5 })
    addItem({ type: 'berry', subType: 'strawberry', name: 'Strawberry', quantity: 3 })

    let state = useInventoryStore.getState()
    expect(state.items).toHaveLength(28) // Fixed array size
    // Check that items were added
    const nonNullItems = state.items.filter(item => item !== null)
    expect(nonNullItems).toHaveLength(2)

    // Clear inventory
    clearInventory()

    state = useInventoryStore.getState()
    expect(state.items).toHaveLength(28) // Still fixed array size
    // Check that all items are null
    const remainingItems = state.items.filter(item => item !== null)
    expect(remainingItems).toHaveLength(0)
  })

  it('should identify berry items correctly', () => {
    const { addItem } = useInventoryStore.getState()

    // Add a berry item
    addItem({
      type: 'berry',
      subType: 'blueberry',
      name: 'Blueberry',
      quantity: 1,
    })

    const state = useInventoryStore.getState()
    const berryItem = state.items[0]

    expect(berryItem).not.toBeNull() // Ensure item was added
    expect(berryItem.type).toBe('berry')
    expect(berryItem.subType).toBe('blueberry')
    expect(berryItem.name).toBe('Blueberry')
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
