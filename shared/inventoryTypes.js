/**
 * Inventory Data Structures and Types
 * 
 * Defines the structure for inventory slots, item instances, and related operations.
 */

// Import handling for both CommonJS and ES modules
let getItemDefinition, isValidItemId;
if (typeof require !== 'undefined') {
  // CommonJS (Node.js)
  const itemDefs = require('./itemDefinitions.js');
  getItemDefinition = itemDefs.getItemDefinition;
  isValidItemId = itemDefs.isValidItemId;
} else {
  // ES modules or browser
  if (typeof window !== 'undefined' && window.ItemDefinitions) {
    getItemDefinition = window.ItemDefinitions.getItemDefinition;
    isValidItemId = window.ItemDefinitions.isValidItemId;
  }
}

// Constants
const INVENTORY_SIZE = 28; // 4x7 grid as shown in current UI
const MAX_STACK_SIZE_DEFAULT = 99;

/**
 * Item Instance - represents a specific instance of an item in inventory
 */
class ItemInstance {
  constructor({
    itemId,
    quantity = 1,
    metadata = {},
    instanceId = null
  }) {
    if (!isValidItemId(itemId)) {
      throw new Error(`Invalid item ID: ${itemId}`);
    }

    const itemDef = getItemDefinition(itemId);
    
    this.itemId = itemId;
    this.quantity = Math.max(1, Math.min(quantity, itemDef.maxStackSize));
    this.metadata = { ...metadata };
    this.instanceId = instanceId || this.generateInstanceId();
    
    // Validate quantity for non-stackable items
    if (!itemDef.isStackable && this.quantity > 1) {
      throw new Error(`Item ${itemId} is not stackable but quantity ${quantity} was provided`);
    }
  }

  generateInstanceId() {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the item definition for this instance
   */
  getDefinition() {
    return getItemDefinition(this.itemId);
  }

  /**
   * Check if this item can stack with another item instance
   */
  canStackWith(otherInstance) {
    if (!otherInstance || !(otherInstance instanceof ItemInstance)) {
      return false;
    }

    const itemDef = this.getDefinition();
    return (
      itemDef.isStackable &&
      this.itemId === otherInstance.itemId &&
      JSON.stringify(this.metadata) === JSON.stringify(otherInstance.metadata)
    );
  }

  /**
   * Try to stack with another item instance
   * Returns the remaining quantity that couldn't be stacked
   */
  stackWith(otherInstance) {
    if (!this.canStackWith(otherInstance)) {
      return otherInstance.quantity;
    }

    const itemDef = this.getDefinition();
    const totalQuantity = this.quantity + otherInstance.quantity;
    const maxCanStack = itemDef.maxStackSize;

    if (totalQuantity <= maxCanStack) {
      this.quantity = totalQuantity;
      return 0; // All stacked successfully
    } else {
      this.quantity = maxCanStack;
      return totalQuantity - maxCanStack; // Remaining quantity
    }
  }

  /**
   * Split this item instance into two
   * Returns a new ItemInstance with the split quantity
   */
  split(splitQuantity) {
    if (splitQuantity >= this.quantity) {
      throw new Error('Cannot split more than current quantity');
    }

    if (splitQuantity <= 0) {
      throw new Error('Split quantity must be positive');
    }

    const newInstance = new ItemInstance({
      itemId: this.itemId,
      quantity: splitQuantity,
      metadata: { ...this.metadata }
    });

    this.quantity -= splitQuantity;
    return newInstance;
  }

  /**
   * Create a copy of this item instance
   */
  clone() {
    return new ItemInstance({
      itemId: this.itemId,
      quantity: this.quantity,
      metadata: { ...this.metadata },
      instanceId: this.instanceId
    });
  }

  /**
   * Serialize to JSON for database storage
   */
  toJSON() {
    return {
      itemId: this.itemId,
      quantity: this.quantity,
      metadata: this.metadata,
      instanceId: this.instanceId
    };
  }

  /**
   * Create ItemInstance from JSON data
   */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }

    try {
      return new ItemInstance({
        itemId: data.itemId,
        quantity: data.quantity || 1,
        metadata: data.metadata || {},
        instanceId: data.instanceId
      });
    } catch (error) {
      console.error('Failed to create ItemInstance from JSON:', error);
      return null;
    }
  }
}

/**
 * Inventory Slot - represents a single slot in the inventory
 */
class InventorySlot {
  constructor(slotIndex, itemInstance = null) {
    this.slotIndex = slotIndex;
    this.itemInstance = itemInstance;
  }

  /**
   * Check if the slot is empty
   */
  isEmpty() {
    return this.itemInstance === null;
  }

  /**
   * Get the item instance in this slot
   */
  getItem() {
    return this.itemInstance;
  }

  /**
   * Set the item instance in this slot
   */
  setItem(itemInstance) {
    if (itemInstance && !(itemInstance instanceof ItemInstance)) {
      throw new Error('Item must be an ItemInstance');
    }
    this.itemInstance = itemInstance;
  }

  /**
   * Clear the slot
   */
  clear() {
    this.itemInstance = null;
  }

  /**
   * Try to add an item to this slot (stacking if possible)
   * Returns the remaining quantity that couldn't be added
   */
  addItem(itemInstance) {
    if (this.isEmpty()) {
      this.itemInstance = itemInstance;
      return 0;
    }

    if (this.itemInstance.canStackWith(itemInstance)) {
      return this.itemInstance.stackWith(itemInstance);
    }

    return itemInstance.quantity; // Couldn't add any
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      slotIndex: this.slotIndex,
      itemInstance: this.itemInstance ? this.itemInstance.toJSON() : null
    };
  }

  /**
   * Create InventorySlot from JSON data
   */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const itemInstance = data.itemInstance ? ItemInstance.fromJSON(data.itemInstance) : null;
    return new InventorySlot(data.slotIndex, itemInstance);
  }
}

/**
 * Helper functions for inventory operations
 */
const createEmptyInventory = () => {
  const slots = [];
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    slots.push(new InventorySlot(i));
  }
  return slots;
};

const serializeInventory = (inventorySlots) => {
  return inventorySlots.map(slot => slot.toJSON());
};

const deserializeInventory = (inventoryData) => {
  if (!Array.isArray(inventoryData)) {
    return createEmptyInventory();
  }

  const slots = [];
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const slotData = inventoryData[i];
    if (slotData) {
      const slot = InventorySlot.fromJSON(slotData);
      slots.push(slot || new InventorySlot(i));
    } else {
      slots.push(new InventorySlot(i));
    }
  }

  return slots;
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = {
    INVENTORY_SIZE,
    MAX_STACK_SIZE_DEFAULT,
    ItemInstance,
    InventorySlot,
    createEmptyInventory,
    serializeInventory,
    deserializeInventory
  };
}
