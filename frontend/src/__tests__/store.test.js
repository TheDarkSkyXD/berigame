import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from '../store';

describe('Inventory Store Drag and Drop', () => {
  let store;

  beforeEach(() => {
    // Reset store state before each test
    store = useInventoryStore.getState();
    store.clearInventory();
    store.clearDragState();
  });

  it('should initialize with empty drag state', () => {
    expect(store.draggedItem).toBeNull();
    expect(store.draggedFromSlot).toBeNull();
    expect(store.dragOverSlot).toBeNull();
  });

  it('should set dragged item correctly', () => {
    const item = { id: 1, type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    const slot = 0;

    store.setDraggedItem(item, slot);

    const newState = useInventoryStore.getState();
    expect(newState.draggedItem).toEqual(item);
    expect(newState.draggedFromSlot).toBe(slot);
  });

  it('should set drag over slot correctly', () => {
    const slot = 5;

    store.setDragOverSlot(slot);

    const newState = useInventoryStore.getState();
    expect(newState.dragOverSlot).toBe(slot);
  });

  it('should clear drag state correctly', () => {
    // Set up some drag state
    const item = { id: 1, type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    store.setDraggedItem(item, 0);
    store.setDragOverSlot(5);

    // Clear it
    store.clearDragState();

    const newState = useInventoryStore.getState();
    expect(newState.draggedItem).toBeNull();
    expect(newState.draggedFromSlot).toBeNull();
    expect(newState.dragOverSlot).toBeNull();
  });

  it('should move items between slots correctly', () => {
    // Add some items to the inventory
    const item1 = { type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    const item2 = { type: 'berry', subType: 'strawberry', name: 'Strawberry' };

    store.addItem(item1);
    store.addItem(item2);

    let state = useInventoryStore.getState();
    expect(state.items[0]).toMatchObject({ type: 'berry', subType: 'blueberry' });
    expect(state.items[1]).toMatchObject({ type: 'berry', subType: 'strawberry' });

    // Move item from slot 0 to slot 5 (empty slot)
    store.moveItem(0, 5);

    state = useInventoryStore.getState();
    console.log('After move - slot 0:', state.items[0]);
    console.log('After move - slot 5:', state.items[5]);

    // When moving to an empty slot, the original slot should become null
    expect(state.items[0]).toBeNull();
    expect(state.items[5]).toMatchObject({ type: 'berry', subType: 'blueberry' });
    // Slot 1 should still have the strawberry
    expect(state.items[1]).toMatchObject({ type: 'berry', subType: 'strawberry' });
  });

  it('should handle moving to same slot (no-op)', () => {
    const item = { id: 1, type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    store.addItem(item);

    const stateBefore = useInventoryStore.getState();
    store.moveItem(0, 0);
    const stateAfter = useInventoryStore.getState();

    expect(stateAfter.items).toEqual(stateBefore.items);
  });

  it('should expand array when moving to higher slot indices', () => {
    const item = { id: 1, type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    store.addItem(item);

    // Move to slot 10 (should expand array)
    store.moveItem(0, 10);

    const state = useInventoryStore.getState();
    expect(state.items.length).toBeGreaterThan(10);
    expect(state.items[10]).toMatchObject({ type: 'berry', subType: 'blueberry' });
    expect(state.items[0]).toBeNull();
  });

  it('should swap items when both slots are occupied', () => {
    const item1 = { id: 1, type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    const item2 = { id: 2, type: 'berry', subType: 'strawberry', name: 'Strawberry' };
    
    store.addItem(item1);
    store.addItem(item2);

    // Swap items in slots 0 and 1
    store.moveItem(0, 1);

    const state = useInventoryStore.getState();
    expect(state.items[0]).toMatchObject({ type: 'berry', subType: 'strawberry' });
    expect(state.items[1]).toMatchObject({ type: 'berry', subType: 'blueberry' });
  });

  it('should handle removeItem with slot-based approach', () => {
    const item1 = { id: 1, type: 'berry', subType: 'blueberry', name: 'Blueberry' };
    const item2 = { id: 2, type: 'berry', subType: 'strawberry', name: 'Strawberry' };
    
    store.addItem(item1);
    store.addItem(item2);

    let state = useInventoryStore.getState();
    const itemToRemove = state.items[0];
    
    store.removeItem(itemToRemove.id);

    state = useInventoryStore.getState();
    expect(state.items[0]).toBeNull();
    expect(state.items[1]).toMatchObject({ type: 'berry', subType: 'strawberry' });
  });

  it('should count items correctly with null slots', () => {
    // Add different berry types to avoid stacking
    const item1 = { type: 'berry', subType: 'blueberry', name: 'Blueberry', quantity: 3 };
    const item2 = { type: 'berry', subType: 'strawberry', name: 'Strawberry', quantity: 2 };

    store.addItem(item1);
    store.addItem(item2);

    let state = useInventoryStore.getState();
    const item1Id = state.items[0].id;

    // Remove first item to create null slot
    store.removeItem(item1Id);

    state = useInventoryStore.getState();
    const blueberryCount = store.getItemCount('berry', 'blueberry')(state);
    const strawberryCount = store.getItemCount('berry', 'strawberry')(state);
    expect(blueberryCount).toBe(0); // Blueberry was removed
    expect(strawberryCount).toBe(2); // Strawberry should remain
  });
});
