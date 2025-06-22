/**
 * Inventory Operations
 * 
 * Provides high-level operations for inventory management that can be used
 * by both frontend and backend code.
 */

// Import handling for both CommonJS and ES modules
let ItemInstance, InventorySlot, INVENTORY_SIZE, createEmptyInventory, serializeInventory, deserializeInventory, getItemDefinition;

if (typeof require !== 'undefined') {
  // CommonJS (Node.js)
  const inventoryTypes = require('./inventoryTypes.js');
  const itemDefs = require('./itemDefinitions.js');

  ItemInstance = inventoryTypes.ItemInstance;
  InventorySlot = inventoryTypes.InventorySlot;
  INVENTORY_SIZE = inventoryTypes.INVENTORY_SIZE;
  createEmptyInventory = inventoryTypes.createEmptyInventory;
  serializeInventory = inventoryTypes.serializeInventory;
  deserializeInventory = inventoryTypes.deserializeInventory;
  getItemDefinition = itemDefs.getItemDefinition;
}

/**
 * Inventory Manager - handles all inventory operations
 */
class InventoryManager {
  constructor(inventoryData = null) {
    this.slots = inventoryData ? deserializeInventory(inventoryData) : createEmptyInventory();
  }

  /**
   * Get all slots
   */
  getSlots() {
    return this.slots;
  }

  /**
   * Get a specific slot
   */
  getSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= INVENTORY_SIZE) {
      throw new Error(`Invalid slot index: ${slotIndex}`);
    }
    return this.slots[slotIndex];
  }

  /**
   * Check if a slot is empty
   */
  isSlotEmpty(slotIndex) {
    return this.getSlot(slotIndex).isEmpty();
  }

  /**
   * Get item in a specific slot
   */
  getItemInSlot(slotIndex) {
    return this.getSlot(slotIndex).getItem();
  }

  /**
   * Add an item to inventory (finds best slot automatically)
   * Returns { success: boolean, remainingQuantity: number, slotsUsed: number[] }
   */
  addItem(itemId, quantity = 1, metadata = {}) {
    const itemDef = getItemDefinition(itemId);
    if (!itemDef) {
      return { success: false, remainingQuantity: quantity, slotsUsed: [], error: 'Invalid item ID' };
    }

    let remainingQuantity = quantity;
    const slotsUsed = [];
    const itemInstance = new ItemInstance({ itemId, quantity, metadata });

    // First, try to stack with existing items
    if (itemDef.isStackable) {
      for (let i = 0; i < INVENTORY_SIZE && remainingQuantity > 0; i++) {
        const slot = this.slots[i];
        if (!slot.isEmpty() && slot.getItem().canStackWith(itemInstance)) {
          const beforeQuantity = remainingQuantity;
          remainingQuantity = slot.addItem(new ItemInstance({ 
            itemId, 
            quantity: remainingQuantity, 
            metadata 
          }));
          
          if (remainingQuantity < beforeQuantity) {
            slotsUsed.push(i);
          }
        }
      }
    }

    // Then, use empty slots for remaining quantity
    for (let i = 0; i < INVENTORY_SIZE && remainingQuantity > 0; i++) {
      const slot = this.slots[i];
      if (slot.isEmpty()) {
        const quantityToAdd = Math.min(remainingQuantity, itemDef.maxStackSize);
        slot.setItem(new ItemInstance({ 
          itemId, 
          quantity: quantityToAdd, 
          metadata 
        }));
        remainingQuantity -= quantityToAdd;
        slotsUsed.push(i);
      }
    }

    return {
      success: remainingQuantity === 0,
      remainingQuantity,
      slotsUsed,
      error: remainingQuantity > 0 ? 'Inventory full' : null
    };
  }

  /**
   * Remove an item from inventory
   * Returns { success: boolean, removedQuantity: number, slotsModified: number[] }
   */
  removeItem(itemId, quantity = 1) {
    let remainingToRemove = quantity;
    const slotsModified = [];

    // Remove from slots that contain this item
    for (let i = 0; i < INVENTORY_SIZE && remainingToRemove > 0; i++) {
      const slot = this.slots[i];
      if (!slot.isEmpty() && slot.getItem().itemId === itemId) {
        const item = slot.getItem();
        const quantityToRemove = Math.min(remainingToRemove, item.quantity);
        
        item.quantity -= quantityToRemove;
        remainingToRemove -= quantityToRemove;
        slotsModified.push(i);

        if (item.quantity <= 0) {
          slot.clear();
        }
      }
    }

    return {
      success: remainingToRemove === 0,
      removedQuantity: quantity - remainingToRemove,
      slotsModified,
      error: remainingToRemove > 0 ? 'Not enough items' : null
    };
  }

  /**
   * Move item from one slot to another
   * Returns { success: boolean, error?: string }
   */
  moveItem(fromSlot, toSlot) {
    if (fromSlot < 0 || fromSlot >= INVENTORY_SIZE || toSlot < 0 || toSlot >= INVENTORY_SIZE) {
      return { success: false, error: 'Invalid slot index' };
    }

    if (fromSlot === toSlot) {
      return { success: true }; // No-op
    }

    const sourceSlot = this.slots[fromSlot];
    const targetSlot = this.slots[toSlot];

    if (sourceSlot.isEmpty()) {
      return { success: false, error: 'Source slot is empty' };
    }

    const sourceItem = sourceSlot.getItem();

    if (targetSlot.isEmpty()) {
      // Simple move to empty slot
      targetSlot.setItem(sourceItem);
      sourceSlot.clear();
      return { success: true };
    }

    const targetItem = targetSlot.getItem();

    // Try to stack if possible
    if (sourceItem.canStackWith(targetItem)) {
      const remainingQuantity = targetItem.stackWith(sourceItem);
      if (remainingQuantity === 0) {
        sourceSlot.clear();
      } else {
        sourceItem.quantity = remainingQuantity;
      }
      return { success: true };
    }

    // Swap items if can't stack
    targetSlot.setItem(sourceItem);
    sourceSlot.setItem(targetItem);
    return { success: true };
  }

  /**
   * Get total quantity of a specific item
   */
  getItemCount(itemId) {
    let total = 0;
    for (const slot of this.slots) {
      if (!slot.isEmpty() && slot.getItem().itemId === itemId) {
        total += slot.getItem().quantity;
      }
    }
    return total;
  }

  /**
   * Check if inventory has enough of an item
   */
  hasItem(itemId, quantity = 1) {
    return this.getItemCount(itemId) >= quantity;
  }

  /**
   * Get all items of a specific type
   */
  getItemsByType(itemId) {
    const items = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = this.slots[i];
      if (!slot.isEmpty() && slot.getItem().itemId === itemId) {
        items.push({
          slotIndex: i,
          item: slot.getItem()
        });
      }
    }
    return items;
  }

  /**
   * Find first empty slot
   */
  findEmptySlot() {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      if (this.slots[i].isEmpty()) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Get inventory utilization stats
   */
  getStats() {
    let usedSlots = 0;
    let totalItems = 0;
    const itemCounts = {};

    for (const slot of this.slots) {
      if (!slot.isEmpty()) {
        usedSlots++;
        const item = slot.getItem();
        totalItems += item.quantity;
        itemCounts[item.itemId] = (itemCounts[item.itemId] || 0) + item.quantity;
      }
    }

    return {
      usedSlots,
      emptySlots: INVENTORY_SIZE - usedSlots,
      totalItems,
      itemCounts,
      utilizationPercent: (usedSlots / INVENTORY_SIZE) * 100
    };
  }

  /**
   * Clear entire inventory
   */
  clear() {
    for (const slot of this.slots) {
      slot.clear();
    }
  }

  /**
   * Serialize inventory for storage
   */
  serialize() {
    return serializeInventory(this.slots);
  }

  /**
   * Create a copy of this inventory
   */
  clone() {
    const clonedData = this.serialize();
    return new InventoryManager(clonedData);
  }

  /**
   * Validate inventory integrity
   */
  validate() {
    const errors = [];

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = this.slots[i];
      if (!slot.isEmpty()) {
        const item = slot.getItem();
        const itemDef = getItemDefinition(item.itemId);

        if (!itemDef) {
          errors.push(`Slot ${i}: Invalid item ID ${item.itemId}`);
          continue;
        }

        if (item.quantity <= 0) {
          errors.push(`Slot ${i}: Invalid quantity ${item.quantity}`);
        }

        if (item.quantity > itemDef.maxStackSize) {
          errors.push(`Slot ${i}: Quantity ${item.quantity} exceeds max stack size ${itemDef.maxStackSize}`);
        }

        if (!itemDef.isStackable && item.quantity > 1) {
          errors.push(`Slot ${i}: Non-stackable item has quantity ${item.quantity}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = {
    InventoryManager
  };
}
