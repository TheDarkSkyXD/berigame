/**
 * DEPRECATED CLEANUP FUNCTIONS
 *
 * These functions are no longer needed because DynamoDB TTL automatically handles cleanup:
 * - Connection items: ttl = current_time + 120 seconds (2 minutes)
 * - Ground items: ttl = current_time + 3600 seconds (1 hour)
 * - Harvest items: ttl = current_time + 600 seconds (10 minutes)
 *
 * The expensive table scans in these functions were causing 1+ second delays during
 * user connections. DynamoDB TTL will automatically delete expired items within 48 hours.
 *
 * These functions have been removed from serverless.yml scheduled events.
 */

const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Handle offline environment for API Gateway Management API
let apig = null;
try {
  const endpoint = process.env.IS_OFFLINE
    ? `http://localhost:3001`
    : process.env.APIG_ENDPOINT;

  if (endpoint) {
    apig = new AWS.ApiGatewayManagementApi({
      endpoint: endpoint,
    });
  } else {
    console.warn("⚠️ APIG_ENDPOINT not set, WebSocket operations will be skipped");
  }
} catch (error) {
  console.warn("⚠️ Failed to initialize API Gateway Management API:", error.message);
}

const DB = process.env.DB;

// Log levels: ERROR = 0, WARN = 1, INFO = 2, DEBUG = 3
const LOG_LEVEL = parseInt(process.env.LOG_LEVEL) || 1; // Default to WARN level

const logger = {
  error: (message, ...args) => {
    if (LOG_LEVEL >= 0) console.error(message, ...args);
  },
  warn: (message, ...args) => {
    if (LOG_LEVEL >= 1) console.warn(message, ...args);
  },
  info: (message, ...args) => {
    if (LOG_LEVEL >= 2) console.log(message, ...args);
  },
  debug: (message, ...args) => {
    if (LOG_LEVEL >= 3) console.log(message, ...args);
  }
};

/**
 * Clean up stale connections that have expired TTL or return 410 errors
 */
exports.cleanupStaleConnections = async (event, context) => {
  logger.info("🧹 Starting stale connection cleanup...");
  
  const startTime = Date.now();
  let totalConnections = 0;
  let staleConnections = 0;
  let expiredConnections = 0;
  let errorConnections = 0;
  
  try {
    // Scan for all connections across all chat rooms
    const scanParams = {
      TableName: DB,
      FilterExpression: "begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":sk": "CONNECTION#",
      },
    };
    
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const scanResult = await dynamodb.scan(scanParams).promise();
      totalConnections += scanResult.Items.length;
      
      // Process each connection
      for (const connection of scanResult.Items) {
        const connectionId = connection.SK.split("#")[1];
        const chatRoomId = connection.PK;
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Check if connection has expired TTL
        if (connection.ttl && connection.ttl < currentTime) {
          logger.debug(`⏰ Connection ${connectionId} has expired TTL (${connection.ttl} < ${currentTime})`);
          await deleteConnection(chatRoomId, connectionId);
          expiredConnections++;
          continue;
        }
        
        // Test if connection is still active by trying to send a ping
        // Skip WebSocket testing in offline mode
        if (apig && !process.env.IS_OFFLINE) {
          try {
            await apig.postToConnection({
              ConnectionId: connectionId,
              Data: JSON.stringify({ type: "ping", timestamp: Date.now() }),
            }).promise();

            logger.debug(`✅ Connection ${connectionId} is active`);

          } catch (e) {
            if (e.statusCode === 410) {
              logger.debug(`💀 Connection ${connectionId} is stale (410 error)`);
              await deleteConnection(chatRoomId, connectionId);
              staleConnections++;
            } else {
              logger.warn(`❌ Error testing connection ${connectionId}: ${e.statusCode} - ${e.message}`);
              errorConnections++;
            }
          }
        } else {
          // In offline mode, just log that we're skipping WebSocket testing
          logger.debug(`🔧 Offline mode: Skipping WebSocket test for ${connectionId}`);
        }
      }
      
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
      
    } while (lastEvaluatedKey);
    
    const duration = Date.now() - startTime;
    
    logger.info(`✅ Cleanup completed in ${duration}ms:`, {
      totalConnections,
      staleConnections,
      expiredConnections,
      errorConnections,
      cleanedUp: staleConnections + expiredConnections
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Cleanup completed successfully",
        stats: {
          totalConnections,
          staleConnections,
          expiredConnections,
          errorConnections,
          cleanedUp: staleConnections + expiredConnections,
          duration
        }
      })
    };
    
  } catch (error) {
    logger.error("Error during cleanup:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Cleanup failed",
        error: error.message
      })
    };
  }
};

/**
 * Delete a connection from the database
 */
async function deleteConnection(chatRoomId, connectionId) {
  try {
    await dynamodb.delete({
      TableName: DB,
      Key: {
        PK: chatRoomId,
        SK: "CONNECTION#" + connectionId,
      },
    }).promise();
    
    logger.debug(`🗑️ Deleted connection ${connectionId} from ${chatRoomId}`);
    
  } catch (error) {
    logger.error(`Failed to delete connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Clean up expired ground items (items that have been on the ground too long)
 */
exports.cleanupExpiredGroundItems = async (event, context) => {
  logger.info("🧹 Starting expired ground items cleanup...");
  
  const startTime = Date.now();
  let totalItems = 0;
  let expiredItems = 0;
  
  try {
    // Scan for all ground items across all chat rooms
    const scanParams = {
      TableName: DB,
      FilterExpression: "begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":sk": "GROUND_ITEM#",
      },
    };
    
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const scanResult = await dynamodb.scan(scanParams).promise();
      totalItems += scanResult.Items.length;
      
      // Process each ground item
      for (const item of scanResult.Items) {
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Check if item has expired TTL
        if (item.ttl && item.ttl < currentTime) {
          logger.debug(`⏰ Ground item ${item.SK} has expired TTL`);
          
          await dynamodb.delete({
            TableName: DB,
            Key: {
              PK: item.PK,
              SK: item.SK,
            },
          }).promise();
          
          expiredItems++;
        }
      }
      
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
      
    } while (lastEvaluatedKey);
    
    const duration = Date.now() - startTime;
    
    logger.info(`✅ Ground items cleanup completed in ${duration}ms:`, {
      totalItems,
      expiredItems
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Ground items cleanup completed successfully",
        stats: {
          totalItems,
          expiredItems,
          duration
        }
      })
    };
    
  } catch (error) {
    logger.error("Error during ground items cleanup:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Ground items cleanup failed",
        error: error.message
      })
    };
  }
};
