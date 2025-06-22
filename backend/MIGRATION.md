# Inventory System Migration

This document describes the migration from the legacy berry tally system to the new slot-based inventory system.

## Overview

The inventory system has been completely refactored to use a slot-based approach with item IDs instead of separate berry tally fields. This provides:

- **Extensibility**: Easy to add new item types
- **Flexibility**: Support for non-stackable items and item metadata
- **Consistency**: Same data structure on frontend and backend
- **Future-proof**: Ready for equipment, tools, weapons, etc.

## Migration Process

### Automatic Migration

The system includes automatic migration that runs when players connect:

1. **Detection**: When a player connects, the system checks if their data needs migration
2. **Migration**: If needed, legacy berry tallies are converted to slot-based inventory
3. **Cleanup**: Old berry fields are removed from the database
4. **Validation**: The migration is validated to ensure no data loss

### Manual Migration Script

For bulk migration of all players, use the migration script:

```bash
cd backend
npm run migrate-inventory
```

### Migration Script Features

- **Batch Processing**: Migrates players in batches to avoid overwhelming the database
- **Validation**: Ensures no berries are lost during migration
- **Progress Tracking**: Shows detailed progress and statistics
- **Error Handling**: Gracefully handles errors and provides detailed reports
- **Idempotent**: Safe to run multiple times (skips already migrated players)

## Data Structure Changes

### Before (Legacy)
```javascript
{
  berries: 5,
  berries_blueberry: 3,
  berries_strawberry: 2,
  berries_greenberry: 0,
  berries_goldberry: 0
}
```

### After (New)
```javascript
{
  inventory: [
    { itemId: "berry_blueberry", quantity: 3, instanceId: "item_123", metadata: {} },
    { itemId: "berry_strawberry", quantity: 2, instanceId: "item_124", metadata: {} },
    null, // empty slots
    // ... up to 28 slots total
  ]
}
```

## Item ID Mapping

Legacy berry types are mapped to new item IDs:

- `blueberry` → `berry_blueberry`
- `strawberry` → `berry_strawberry`
- `greenberry` → `berry_greenberry`
- `goldberry` → `berry_goldberry`

## Validation

The migration includes comprehensive validation:

1. **Item Count Verification**: Ensures all berries are migrated correctly
2. **Inventory Integrity**: Validates the new inventory structure
3. **No Data Loss**: Confirms no berries are lost during migration

## Rollback

⚠️ **Important**: This migration does not maintain backward compatibility. Once migrated, the old berry fields are permanently removed.

If rollback is needed:
1. Restore from database backup
2. Revert code to previous version
3. Redeploy application

## Monitoring

During and after migration, monitor:

- **Player Connection Logs**: Check for migration messages
- **Error Logs**: Watch for migration failures
- **Database Performance**: Monitor for any performance impacts
- **Player Reports**: Check for any inventory-related issues

## Troubleshooting

### Common Issues

1. **Migration Fails for Some Players**
   - Check error logs for specific failure reasons
   - Manually inspect problematic player data
   - Run migration script again (it will skip successful migrations)

2. **Performance Issues**
   - Reduce batch size in migration script
   - Run migration during low-traffic periods
   - Monitor database metrics

3. **Data Inconsistencies**
   - Use validation functions to check inventory integrity
   - Compare pre and post-migration berry counts
   - Check for any remaining legacy fields

### Manual Fixes

If needed, individual players can be migrated manually:

```javascript
const { createCleanPlayerData } = require('./shared/inventoryMigration.js');

// Get player data from database
const playerData = await dynamodb.get({
  TableName: DB,
  Key: { PK: "CHATROOM#...", SK: "CONNECTION#..." }
}).promise();

// Migrate
const cleanData = createCleanPlayerData(playerData.Item);

// Update database
await dynamodb.update({
  TableName: DB,
  Key: { PK: playerData.Item.PK, SK: playerData.Item.SK },
  UpdateExpression: 'SET inventory = :inventory REMOVE berries, berries_blueberry, berries_strawberry, berries_greenberry, berries_goldberry',
  ExpressionAttributeValues: { ':inventory': cleanData.inventory }
}).promise();
```

## Testing

Before running migration in production:

1. **Test with Sample Data**: Run migration script on development environment
2. **Validate Results**: Check that all berries are correctly migrated
3. **Test Game Functionality**: Ensure inventory operations work correctly
4. **Performance Testing**: Verify migration doesn't impact database performance

## Post-Migration

After successful migration:

1. **Monitor Player Feedback**: Watch for any inventory-related issues
2. **Verify Functionality**: Test all inventory operations (pickup, drop, consume)
3. **Clean Up**: Remove migration-related code after confirming stability
4. **Documentation**: Update any remaining references to old berry system
