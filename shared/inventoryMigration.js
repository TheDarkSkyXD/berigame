/**
 * Inventory Migration Utilities
 * 
 * Handles conversion from legacy berry tally system to new slot-based inventory
 */

// Import handling for both CommonJS and ES modules
let InventoryManager, getLegacyBerryItemId;

if (typeof require !== 'undefined') {
  // CommonJS (Node.js)
  const inventoryOps = require('./inventoryOperations.js');
  const itemDefs = require('./itemDefinitions.js');

  InventoryManager = inventoryOps.InventoryManager;
  getLegacyBerryItemId = itemDefs.getLegacyBerryItemId;
}

/**
 * Convert legacy berry tallies to new inventory format
 */
const migrateLegacyInventory = (legacyPlayerData) => {
  const inventory = new InventoryManager();
  
  // Legacy berry fields to migrate
  const legacyBerryFields = [
    { field: 'berries_blueberry', berryType: 'blueberry' },
    { field: 'berries_strawberry', berryType: 'strawberry' },
    { field: 'berries_greenberry', berryType: 'greenberry' },
    { field: 'berries_goldberry', berryType: 'goldberry' }
  ];

  // Convert each berry type
  for (const { field, berryType } of legacyBerryFields) {
    const quantity = legacyPlayerData[field] || 0;
    if (quantity > 0) {
      const itemId = getLegacyBerryItemId(berryType);
      if (itemId) {
        const result = inventory.addItem(itemId, quantity);
        if (!result.success) {
          console.warn(`Failed to migrate ${quantity} ${berryType}: ${result.error}`);
        }
      }
    }
  }

  return inventory.serialize();
};

/**
 * Check if player data needs migration
 */
const needsMigration = (playerData) => {
  // Check if new inventory field exists
  if (playerData.inventory && Array.isArray(playerData.inventory)) {
    return false; // Already migrated
  }

  // Check if any legacy berry fields exist
  const legacyFields = ['berries_blueberry', 'berries_strawberry', 'berries_greenberry', 'berries_goldberry'];
  return legacyFields.some(field => playerData[field] !== undefined);
};

/**
 * Get migration summary for logging
 */
const getMigrationSummary = (legacyPlayerData) => {
  const summary = {
    totalBerries: 0,
    berryTypes: {},
    estimatedSlots: 0
  };

  const legacyBerryFields = [
    { field: 'berries_blueberry', berryType: 'blueberry' },
    { field: 'berries_strawberry', berryType: 'strawberry' },
    { field: 'berries_greenberry', berryType: 'greenberry' },
    { field: 'berries_goldberry', berryType: 'goldberry' }
  ];

  for (const { field, berryType } of legacyBerryFields) {
    const quantity = legacyPlayerData[field] || 0;
    if (quantity > 0) {
      summary.totalBerries += quantity;
      summary.berryTypes[berryType] = quantity;
      // Each berry type takes at least 1 slot (they stack up to 99)
      summary.estimatedSlots += Math.ceil(quantity / 99);
    }
  }

  return summary;
};

/**
 * Validate migration result
 */
const validateMigration = (legacyPlayerData, newInventoryData) => {
  const inventory = new InventoryManager(newInventoryData);
  const validation = inventory.validate();
  
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  // Check that all berries were migrated correctly
  const legacyBerryFields = [
    { field: 'berries_blueberry', berryType: 'blueberry' },
    { field: 'berries_strawberry', berryType: 'strawberry' },
    { field: 'berries_greenberry', berryType: 'greenberry' },
    { field: 'berries_goldberry', berryType: 'goldberry' }
  ];

  const migrationErrors = [];

  for (const { field, berryType } of legacyBerryFields) {
    const legacyQuantity = legacyPlayerData[field] || 0;
    const itemId = getLegacyBerryItemId(berryType);
    const newQuantity = inventory.getItemCount(itemId);

    if (legacyQuantity !== newQuantity) {
      migrationErrors.push(
        `Berry count mismatch for ${berryType}: legacy=${legacyQuantity}, new=${newQuantity}`
      );
    }
  }

  return {
    success: migrationErrors.length === 0,
    errors: migrationErrors,
    stats: inventory.getStats()
  };
};

/**
 * Create clean player data structure for new system
 */
const createCleanPlayerData = (legacyPlayerData) => {
  // Migrate inventory
  const newInventory = migrateLegacyInventory(legacyPlayerData);

  // Create new player data structure without legacy berry fields
  const cleanPlayerData = {
    ...legacyPlayerData,
    inventory: newInventory
  };

  // Remove legacy berry fields
  delete cleanPlayerData.berries;
  delete cleanPlayerData.berries_blueberry;
  delete cleanPlayerData.berries_strawberry;
  delete cleanPlayerData.berries_greenberry;
  delete cleanPlayerData.berries_goldberry;

  return cleanPlayerData;
};

/**
 * Batch migration utility for multiple players
 */
const batchMigratePlayers = (playersData) => {
  const results = {
    migrated: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  for (const playerData of playersData) {
    try {
      if (!needsMigration(playerData)) {
        results.skipped++;
        results.details.push({
          playerId: playerData.SK,
          status: 'skipped',
          reason: 'Already migrated'
        });
        continue;
      }

      const summary = getMigrationSummary(playerData);
      const cleanData = createCleanPlayerData(playerData);
      const validation = validateMigration(playerData, cleanData.inventory);

      if (validation.success) {
        results.migrated++;
        results.details.push({
          playerId: playerData.SK,
          status: 'success',
          summary,
          stats: validation.stats
        });
      } else {
        results.errors++;
        results.details.push({
          playerId: playerData.SK,
          status: 'error',
          errors: validation.errors
        });
      }
    } catch (error) {
      results.errors++;
      results.details.push({
        playerId: playerData.SK || 'unknown',
        status: 'error',
        errors: [error.message]
      });
    }
  }

  return results;
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = {
    migrateLegacyInventory,
    needsMigration,
    getMigrationSummary,
    validateMigration,
    createCleanPlayerData,
    batchMigratePlayers
  };
}
