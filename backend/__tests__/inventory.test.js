/**
 * Backend Inventory System Tests
 * 
 * Tests for the new slot-based inventory system including:
 * - Item definitions
 * - Inventory operations

 * - Backend helper functions
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const { InventoryManager } = require('../../shared/inventoryOperations.js');
const { getItemDefinition, isValidItemId, ITEM_DEFINITIONS } = require('../../shared/itemDefinitions.js');

const {
  getPlayerInventory,
  addItemToInventory,
  removeItemFromInventory,
  playerHasItem,
  getPlayerItemCount,
  consumeItem,
  createGroundItemData,
  groundItemToInventoryItem,
  getInventorySyncData
} = require('../inventoryHelper.js');

describe('Item Definitions', () => {
  it('should have valid berry item definitions', () => {
    const berryIds = ['berry_blueberry', 'berry_strawberry', 'berry_greenberry', 'berry_goldberry'];
    
    berryIds.forEach(itemId => {
      const itemDef = getItemDefinition(itemId);
      expect(itemDef).toBeDefined();
      expect(itemDef.id).toBe(itemId);
      expect(itemDef.category).toBe('consumable');
      expect(itemDef.isConsumable).toBe(true);
      expect(itemDef.isStackable).toBe(true);
      expect(itemDef.maxStackSize).toBe(99);
      expect(itemDef.consumeEffect).toBeDefined();
      expect(itemDef.consumeEffect.healthRestore).toBeGreaterThan(0);
    });
  });

  it('should validate item IDs correctly', () => {
    expect(isValidItemId('berry_blueberry')).toBe(true);
    expect(isValidItemId('berry_strawberry')).toBe(true);
    expect(isValidItemId('invalid_item')).toBe(false);
    expect(isValidItemId('')).toBe(false);
    expect(isValidItemId(null)).toBe(false);
  });

  it('should have correct berry health restoration values', () => {
    expect(getItemDefinition('berry_blueberry').consumeEffect.healthRestore).toBe(5);
    expect(getItemDefinition('berry_strawberry').consumeEffect.healthRestore).toBe(3);
    expect(getItemDefinition('berry_greenberry').consumeEffect.healthRestore).toBe(2);
    expect(getItemDefinition('berry_goldberry').consumeEffect.healthRestore).toBe(10);
  });
});

describe('Inventory Manager', () => {
  let inventory;

  beforeEach(() => {
    inventory = new InventoryManager();
  });

  it('should initialize with 28 empty slots', () => {
    const slots = inventory.getSlots();
    expect(slots).toHaveLength(28);
    expect(slots.every(slot => slot.isEmpty())).toBe(true);
  });

  it('should add items correctly', () => {
    const result = inventory.addItem('berry_blueberry', 5);
    
    expect(result.success).toBe(true);
    expect(result.remainingQuantity).toBe(0);
    expect(result.slotsUsed).toHaveLength(1);
    expect(result.slotsUsed[0]).toBe(0);
    
    const item = inventory.getItemInSlot(0);
    expect(item.itemId).toBe('berry_blueberry');
    expect(item.quantity).toBe(5);
  });

  it('should stack items correctly', () => {
    // Add first stack
    inventory.addItem('berry_blueberry', 30);
    
    // Add second stack - should stack with first
    const result = inventory.addItem('berry_blueberry', 20);
    
    expect(result.success).toBe(true);
    expect(result.slotsUsed).toHaveLength(1);
    expect(result.slotsUsed[0]).toBe(0);
    
    const item = inventory.getItemInSlot(0);
    expect(item.quantity).toBe(50);
    
    // Check that only one slot is used
    const usedSlots = inventory.getSlots().filter(slot => !slot.isEmpty());
    expect(usedSlots).toHaveLength(1);
  });

  it('should handle stack overflow correctly', () => {
    // Add max stack
    inventory.addItem('berry_blueberry', 99);
    
    // Try to add more - should create new stack
    const result = inventory.addItem('berry_blueberry', 20);
    
    expect(result.success).toBe(true);
    expect(result.slotsUsed).toHaveLength(1);
    expect(result.slotsUsed[0]).toBe(1); // Second slot
    
    expect(inventory.getItemInSlot(0).quantity).toBe(99);
    expect(inventory.getItemInSlot(1).quantity).toBe(20);
  });

  it('should remove items correctly', () => {
    inventory.addItem('berry_blueberry', 10);
    
    const result = inventory.removeItem('berry_blueberry', 3);
    
    expect(result.success).toBe(true);
    expect(result.removedQuantity).toBe(3);
    expect(inventory.getItemInSlot(0).quantity).toBe(7);
  });

  it('should handle removing more items than available', () => {
    inventory.addItem('berry_blueberry', 5);
    
    const result = inventory.removeItem('berry_blueberry', 10);
    
    expect(result.success).toBe(false);
    expect(result.removedQuantity).toBe(5);
    expect(result.error).toBe('Not enough items');
    expect(inventory.isSlotEmpty(0)).toBe(true);
  });

  it('should move items between slots correctly', () => {
    inventory.addItem('berry_blueberry', 5);
    inventory.addItem('berry_strawberry', 3);
    
    const result = inventory.moveItem(0, 5);
    
    expect(result.success).toBe(true);
    expect(inventory.isSlotEmpty(0)).toBe(true);
    expect(inventory.getItemInSlot(5).itemId).toBe('berry_blueberry');
    expect(inventory.getItemInSlot(1).itemId).toBe('berry_strawberry');
  });

  it('should get item counts correctly', () => {
    inventory.addItem('berry_blueberry', 30);
    inventory.addItem('berry_blueberry', 20);
    inventory.addItem('berry_strawberry', 15);
    
    expect(inventory.getItemCount('berry_blueberry')).toBe(50);
    expect(inventory.getItemCount('berry_strawberry')).toBe(15);
    expect(inventory.getItemCount('berry_goldberry')).toBe(0);
  });

  it('should validate inventory integrity', () => {
    inventory.addItem('berry_blueberry', 50);
    inventory.addItem('berry_strawberry', 25);
    
    const validation = inventory.validate();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});



describe('Backend Helper Functions', () => {
  const mockPlayerData = {
    inventory: [
      { itemId: 'berry_blueberry', quantity: 10, instanceId: 'item_1' },
      { itemId: 'berry_strawberry', quantity: 5, instanceId: 'item_2' }
    ]
  };

  it('should get player inventory correctly', () => {
    const inventory = getPlayerInventory(mockPlayerData);
    expect(inventory).toBeInstanceOf(InventoryManager);
    expect(inventory.getItemCount('berry_blueberry')).toBe(10);
    expect(inventory.getItemCount('berry_strawberry')).toBe(5);
  });

  it('should add items to inventory', () => {
    const result = addItemToInventory(mockPlayerData, 'berry_goldberry', 3);
    
    expect(result.success).toBe(true);
    expect(result.remainingQuantity).toBe(0);
    expect(result.inventory.getItemCount('berry_goldberry')).toBe(3);
  });

  it('should remove items from inventory', () => {
    const result = removeItemFromInventory(mockPlayerData, 'berry_blueberry', 3);
    
    expect(result.success).toBe(true);
    expect(result.removedQuantity).toBe(3);
    expect(result.inventory.getItemCount('berry_blueberry')).toBe(7);
  });

  it('should check if player has items', () => {
    expect(playerHasItem(mockPlayerData, 'berry_blueberry', 5)).toBe(true);
    expect(playerHasItem(mockPlayerData, 'berry_blueberry', 15)).toBe(false);
    expect(playerHasItem(mockPlayerData, 'berry_goldberry', 1)).toBe(false);
  });

  it('should consume items correctly', () => {
    const result = consumeItem(mockPlayerData, 'berry_blueberry', 90, 100);
    
    expect(result.success).toBe(true);
    expect(result.inventory.getItemCount('berry_blueberry')).toBe(9);
    expect(result.effect.healthRestored).toBe(5); // Blueberry restores 5 health
    expect(result.effect.newHealth).toBe(95);
  });

  it('should handle consuming at full health', () => {
    const result = consumeItem(mockPlayerData, 'berry_blueberry', 100, 100);
    
    expect(result.success).toBe(true);
    expect(result.effect.healthRestored).toBe(0); // No health restored at full health
    expect(result.effect.newHealth).toBe(100);
  });

  it('should create ground item data correctly', () => {
    const position = { x: 10, y: 0, z: 15 };
    const groundItem = createGroundItemData('berry_blueberry', 3, position, 'player123');
    
    expect(groundItem.itemId).toBe('berry_blueberry');
    expect(groundItem.quantity).toBe(3);
    expect(groundItem.position).toEqual(position);
    expect(groundItem.droppedBy).toBe('player123');
    expect(groundItem.droppedAt).toBeDefined();
    expect(groundItem.ttl).toBeDefined();
  });

  it('should convert ground items to inventory items', () => {
    const groundItem = {
      itemId: 'berry_strawberry',
      quantity: 7,
      metadata: { special: true }
    };
    
    const inventoryItem = groundItemToInventoryItem(groundItem);
    
    expect(inventoryItem.itemId).toBe('berry_strawberry');
    expect(inventoryItem.quantity).toBe(7);
    expect(inventoryItem.metadata).toEqual({ special: true });
  });

  it('should get inventory sync data', () => {
    const syncData = getInventorySyncData(mockPlayerData);
    
    expect(syncData.items).toBeDefined();
    expect(Array.isArray(syncData.items)).toBe(true);
    expect(syncData.items).toHaveLength(28); // Should always be 28 slots
    
    // Check first item
    expect(syncData.items[0]).toMatchObject({
      type: 'consumable',
      subType: 'berry_blueberry',
      name: 'Blueberry',
      quantity: 10
    });
  });
});
