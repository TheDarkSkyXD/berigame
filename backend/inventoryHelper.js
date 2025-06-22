/**
 * Backend Inventory Helper
 * 
 * Provides backend-specific inventory operations and integrates with DynamoDB
 */

const { InventoryManager } = require('../shared/inventoryOperations.js');
const { getItemDefinition, getLegacyBerryItemId } = require('../shared/itemDefinitions.js');

/**
 * Get player's inventory from database data
 */
const getPlayerInventory = (playerData) => {
  const inventoryData = playerData.inventory || [];

  // Handle different inventory formats
  if (inventoryData.length === 0) {
    // Empty inventory
    return new InventoryManager();
  }

  // Check if it's already in serialized format (array of 28 slot objects)
  if (inventoryData.length === 28 && inventoryData[0] && typeof inventoryData[0].slotIndex === 'number') {
    return new InventoryManager(inventoryData);
  }

  // Handle compact format (array of item objects) - convert to InventoryManager
  const inventory = new InventoryManager();
  for (const itemData of inventoryData) {
    if (itemData && itemData.itemId && itemData.quantity) {
      inventory.addItem(itemData.itemId, itemData.quantity, itemData.metadata || {});
    }
  }

  return inventory;
};

/**
 * Add item to player's inventory
 * Returns { success: boolean, inventory: InventoryManager, remainingQuantity: number }
 */
const addItemToInventory = (playerData, itemId, quantity = 1, metadata = {}) => {
  const inventory = getPlayerInventory(playerData);
  const result = inventory.addItem(itemId, quantity, metadata);
  
  return {
    success: result.success,
    inventory,
    remainingQuantity: result.remainingQuantity,
    slotsUsed: result.slotsUsed,
    error: result.error
  };
};

/**
 * Remove item from player's inventory
 * Returns { success: boolean, inventory: InventoryManager, removedQuantity: number }
 */
const removeItemFromInventory = (playerData, itemId, quantity = 1) => {
  const inventory = getPlayerInventory(playerData);
  const result = inventory.removeItem(itemId, quantity);
  
  return {
    success: result.success,
    inventory,
    removedQuantity: result.removedQuantity,
    slotsModified: result.slotsModified,
    error: result.error
  };
};

/**
 * Check if player has enough of an item
 */
const playerHasItem = (playerData, itemId, quantity = 1) => {
  const inventory = getPlayerInventory(playerData);
  return inventory.hasItem(itemId, quantity);
};

/**
 * Get item count for player
 */
const getPlayerItemCount = (playerData, itemId) => {
  const inventory = getPlayerInventory(playerData);
  return inventory.getItemCount(itemId);
};

/**
 * Create DynamoDB update expression for inventory
 */
const createInventoryUpdateExpression = (inventory) => {
  return {
    UpdateExpression: 'SET inventory = :inventory',
    ExpressionAttributeValues: {
      ':inventory': inventory.serialize()
    }
  };
};



/**
 * Get consumable effect for an item
 */
const getConsumeEffect = (itemId) => {
  const itemDef = getItemDefinition(itemId);
  return itemDef?.consumeEffect || null;
};

/**
 * Process item consumption (e.g., eating berries)
 * Returns { success: boolean, inventory: InventoryManager, effect: object }
 */
const consumeItem = (playerData, itemId, currentHealth, maxHealth) => {
  const inventory = getPlayerInventory(playerData);
  
  // Check if player has the item
  if (!inventory.hasItem(itemId, 1)) {
    return {
      success: false,
      inventory,
      error: 'Item not found in inventory'
    };
  }

  // Get item definition and consume effect
  const itemDef = getItemDefinition(itemId);
  if (!itemDef?.isConsumable) {
    return {
      success: false,
      inventory,
      error: 'Item is not consumable'
    };
  }

  // Remove item from inventory
  const removeResult = inventory.removeItem(itemId, 1);
  if (!removeResult.success) {
    return {
      success: false,
      inventory,
      error: 'Failed to remove item from inventory'
    };
  }

  // Calculate effect
  const effect = itemDef.consumeEffect;
  let newHealth = currentHealth;
  let healthRestored = 0;

  if (effect.healthRestore) {
    const maxRestore = maxHealth - currentHealth;
    healthRestored = Math.min(effect.healthRestore, maxRestore);
    newHealth = Math.min(currentHealth + effect.healthRestore, maxHealth);
  }

  return {
    success: true,
    inventory,
    effect: {
      ...effect,
      healthRestored,
      newHealth
    }
  };
};

/**
 * Create ground item data structure
 */
const createGroundItemData = (itemId, quantity, position, droppedBy, metadata = {}) => {
  const itemDef = getItemDefinition(itemId);
  if (!itemDef) {
    throw new Error(`Invalid item ID: ${itemId}`);
  }

  return {
    itemType: itemDef.category,
    itemSubType: itemId, // Use full item ID as subtype
    itemId, // Add explicit itemId field
    quantity,
    position,
    droppedBy,
    droppedAt: Date.now(),
    metadata,
    ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
  };
};

/**
 * Convert ground item to inventory item
 */
const groundItemToInventoryItem = (groundItem) => {
  // Handle both old and new ground item formats
  const itemId = groundItem.itemId || getLegacyItemId(groundItem.itemSubType);
  
  if (!itemId) {
    throw new Error(`Cannot determine item ID from ground item: ${JSON.stringify(groundItem)}`);
  }

  return {
    itemId,
    quantity: groundItem.quantity || 1,
    metadata: groundItem.metadata || {}
  };
};

/**
 * Helper to get item ID from legacy ground item format
 */
const getLegacyItemId = (itemSubType) => {
  return getLegacyBerryItemId(itemSubType) || itemSubType;
};

/**
 * Get inventory sync data for frontend
 */
const getInventorySyncData = (playerData) => {
  const inventory = getPlayerInventory(playerData);
  const slots = inventory.getSlots();
  
  // Convert to frontend format
  const items = slots.map((slot, index) => {
    if (slot.isEmpty()) {
      return null;
    }
    
    const item = slot.getItem();
    const itemDef = getItemDefinition(item.itemId);
    
    return {
      id: item.instanceId,
      type: itemDef.category,
      subType: item.itemId,
      name: itemDef.name,
      icon: itemDef.icon,
      quantity: item.quantity,
      metadata: item.metadata
    };
  });

  return { items };
};

module.exports = {
  getPlayerInventory,
  addItemToInventory,
  removeItemFromInventory,
  playerHasItem,
  getPlayerItemCount,
  createInventoryUpdateExpression,
  getConsumeEffect,
  consumeItem,
  createGroundItemData,
  groundItemToInventoryItem,
  getInventorySyncData
};
