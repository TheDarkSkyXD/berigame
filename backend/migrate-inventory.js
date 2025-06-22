/**
 * Inventory Migration Script
 * 
 * This script migrates all existing players from the legacy berry tally system
 * to the new slot-based inventory system.
 * 
 * Usage: node migrate-inventory.js
 */

const AWS = require("aws-sdk");
const { 
  migrateLegacyInventory, 
  needsMigration, 
  createCleanPlayerData,
  validateMigration,
  batchMigratePlayers 
} = require("../shared/inventoryMigration.js");

// Configure AWS
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

const DB = process.env.DB || "berigame-dev";

/**
 * Get all player connections from the database
 */
async function getAllPlayers() {
  console.log("🔍 Scanning for all player connections...");
  
  const params = {
    TableName: DB,
    FilterExpression: "begins_with(SK, :connectionPrefix)",
    ExpressionAttributeValues: {
      ":connectionPrefix": "CONNECTION#"
    }
  };

  const allPlayers = [];
  let lastEvaluatedKey = null;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.scan(params).promise();
    allPlayers.push(...result.Items);
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    console.log(`📊 Found ${result.Items.length} players in this batch (total: ${allPlayers.length})`);
  } while (lastEvaluatedKey);

  console.log(`✅ Total players found: ${allPlayers.length}`);
  return allPlayers;
}

/**
 * Migrate a single player
 */
async function migratePlayer(playerData) {
  try {
    if (!needsMigration(playerData)) {
      return { status: 'skipped', reason: 'Already migrated' };
    }

    console.log(`🔄 Migrating player ${playerData.SK}...`);

    // Create clean player data with new inventory
    const cleanPlayerData = createCleanPlayerData(playerData);
    
    // Validate the migration
    const validation = validateMigration(playerData, cleanPlayerData.inventory);
    if (!validation.success) {
      console.error(`❌ Migration validation failed for ${playerData.SK}:`, validation.errors);
      return { status: 'error', errors: validation.errors };
    }

    // Update the player in the database
    const updateParams = {
      TableName: DB,
      Key: {
        PK: playerData.PK,
        SK: playerData.SK
      },
      UpdateExpression: 'SET inventory = :inventory REMOVE berries, berries_blueberry, berries_strawberry, berries_greenberry, berries_goldberry',
      ExpressionAttributeValues: {
        ':inventory': cleanPlayerData.inventory
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ Successfully migrated player ${playerData.SK}`);
    return { 
      status: 'success', 
      stats: validation.stats,
      berrysMigrated: Object.values(validation.stats.itemCounts).reduce((sum, count) => sum + count, 0)
    };

  } catch (error) {
    console.error(`❌ Error migrating player ${playerData.SK}:`, error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log("🚀 Starting inventory migration...");
  console.log("📅 Migration started at:", new Date().toISOString());
  
  const startTime = Date.now();
  
  try {
    // Get all players
    const allPlayers = await getAllPlayers();
    
    if (allPlayers.length === 0) {
      console.log("ℹ️ No players found to migrate.");
      return;
    }

    // Check how many need migration
    const playersNeedingMigration = allPlayers.filter(needsMigration);
    console.log(`📊 Players needing migration: ${playersNeedingMigration.length} out of ${allPlayers.length}`);

    if (playersNeedingMigration.length === 0) {
      console.log("✅ All players are already migrated!");
      return;
    }

    // Migrate players in batches to avoid overwhelming the database
    const BATCH_SIZE = 10;
    const results = {
      migrated: 0,
      skipped: 0,
      errors: 0,
      totalBerrysMigrated: 0,
      details: []
    };

    for (let i = 0; i < playersNeedingMigration.length; i += BATCH_SIZE) {
      const batch = playersNeedingMigration.slice(i, i + BATCH_SIZE);
      console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(playersNeedingMigration.length / BATCH_SIZE)} (${batch.length} players)...`);

      // Process batch in parallel
      const batchPromises = batch.map(player => migratePlayer(player));
      const batchResults = await Promise.all(batchPromises);

      // Aggregate results
      batchResults.forEach((result, index) => {
        const player = batch[index];
        
        if (result.status === 'success') {
          results.migrated++;
          results.totalBerrysMigrated += result.berrysMigrated || 0;
        } else if (result.status === 'skipped') {
          results.skipped++;
        } else {
          results.errors++;
        }

        results.details.push({
          playerId: player.SK,
          ...result
        });
      });

      console.log(`✅ Batch completed. Progress: ${results.migrated + results.skipped + results.errors}/${playersNeedingMigration.length}`);
      
      // Small delay between batches to be gentle on the database
      if (i + BATCH_SIZE < playersNeedingMigration.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Final results
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log("\n🎉 Migration completed!");
    console.log("📊 Final Results:");
    console.log(`   ✅ Successfully migrated: ${results.migrated} players`);
    console.log(`   ⏭️  Skipped (already migrated): ${results.skipped} players`);
    console.log(`   ❌ Errors: ${results.errors} players`);
    console.log(`   🫐 Total berries migrated: ${results.totalBerrysMigrated}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(2)} seconds`);
    console.log("📅 Migration completed at:", new Date().toISOString());

    // Show error details if any
    if (results.errors > 0) {
      console.log("\n❌ Error Details:");
      results.details
        .filter(detail => detail.status === 'error')
        .forEach(detail => {
          console.log(`   Player ${detail.playerId}: ${detail.error || detail.errors?.join(', ')}`);
        });
    }

  } catch (error) {
    console.error("💥 Migration failed with error:", error);
    process.exit(1);
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log("🏁 Migration script finished.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = {
  runMigration,
  migratePlayer,
  getAllPlayers
};
