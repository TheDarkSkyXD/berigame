const uuid = require("uuid");
const AWS = require("aws-sdk");
const jwt = require("jsonwebtoken");
const helpers = require("./helpers");
const { getRounds } = require("bcryptjs");
const { validCallbackObject } = require("./helpers");
const PositionValidator = require("./positionValidator");
const apig = new AWS.ApiGatewayManagementApi({
  //Offline check for websocket issue with serverless offline
  //https://github.com/dherault/serverless-offline/issues/924
  endpoint: process.env.IS_OFFLINE
    ? `http://localhost:3001`
    : process.env.APIG_ENDPOINT,
});
const dynamodb = new AWS.DynamoDB.DocumentClient();

const DB = process.env.DB;
const positionValidator = new PositionValidator(DB);

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

// Connection caching to reduce DynamoDB queries
const connectionCache = new Map();
const staleConnections = new Set(); // Track connections that returned 410 errors
const CACHE_TTL = 30000; // 30 seconds cache TTL
const CACHE_CLEANUP_INTERVAL = 60000; // Clean up every minute

// Clean up expired cache entries and stale connections
setInterval(() => {
  const now = Date.now();
  let cleanedCacheCount = 0;
  let staleConnectionsCount = staleConnections.size;

  // Clean expired cache entries
  for (const [key, value] of connectionCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      connectionCache.delete(key);
      cleanedCacheCount++;
    }
  }

  // Clear stale connections set periodically to allow retry of connections
  // that might have reconnected (every 5 minutes)
  if (now % (5 * 60 * 1000) < CACHE_CLEANUP_INTERVAL) {
    staleConnections.clear();
    if (staleConnectionsCount > 0) {
      logger.debug(`🧹 Cleared ${staleConnectionsCount} stale connection entries for retry`);
    }
  }

  if (cleanedCacheCount > 0) {
    logger.debug(`🧹 Cleaned ${cleanedCacheCount} expired cache entries`);
  }
}, CACHE_CLEANUP_INTERVAL);

/**
 * Get connections with caching to reduce DynamoDB queries
 * @param {string} chatRoomId - The chat room ID
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} Array of connection items
 */
async function getCachedConnections(chatRoomId, forceRefresh = false) {
  const cacheKey = `connections_${chatRoomId}`;
  const now = Date.now();

  // Check cache first
  if (!forceRefresh && connectionCache.has(cacheKey)) {
    const cached = connectionCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL) {
      performanceMetrics.cacheHits++;
      logger.debug(`💾 Cache hit for ${chatRoomId} (${cached.connections.length} connections)`);
      return cached.connections;
    }
  }

  // Cache miss - query DynamoDB
  performanceMetrics.cacheMisses++;
  const queryStartTime = Date.now();
  logger.debug(`🔍 Querying DynamoDB for connections in ${chatRoomId}...`);

  const usersParams = {
    TableName: DB,
    KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": chatRoomId,
      ":sk": "CONNECTION#",
    },
  };

  const result = await dynamodb.query(usersParams).promise();
  const queryTime = Date.now() - queryStartTime;

  logger.debug(`📊 DynamoDB query completed in ${queryTime}ms (${result.Items.length} connections found)`);

  if (queryTime > 200) {
    logger.warn(`🐌 Slow DynamoDB query: ${queryTime}ms for connections in ${chatRoomId}`);
  }

  // Cache the result
  connectionCache.set(cacheKey, {
    connections: result.Items,
    timestamp: now
  });

  return result.Items;
}

/**
 * Performance monitoring for broadcasting
 */
const performanceMetrics = {
  totalBroadcasts: 0,
  totalBroadcastTime: 0,
  averageBroadcastTime: 0,
  slowBroadcasts: 0,
  failedConnections: 0,
  cacheHits: 0,
  cacheMisses: 0
};

/**
 * Log performance metrics periodically - only when there's significant activity
 */
setInterval(() => {
  const hasSignificantActivity = performanceMetrics.totalBroadcasts > 5 ||
                                 performanceMetrics.failedConnections > 10 ||
                                 performanceMetrics.slowBroadcasts > 0;

  if (hasSignificantActivity) {
    const cacheHitRate = performanceMetrics.cacheHits + performanceMetrics.cacheMisses > 0
      ? Math.round((performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses)) * 100)
      : 0;

    const failureRate = performanceMetrics.totalBroadcasts > 0
      ? Math.round((performanceMetrics.failedConnections / performanceMetrics.totalBroadcasts) * 100)
      : 0;

    logger.info('📊 Broadcasting Performance (1min):', {
      broadcasts: performanceMetrics.totalBroadcasts,
      avgTime: Math.round(performanceMetrics.averageBroadcastTime) + 'ms',
      slowBroadcasts: performanceMetrics.slowBroadcasts,
      failedConnections: performanceMetrics.failedConnections,
      failureRate: failureRate + '%',
      cacheHitRate: cacheHitRate + '%',
      staleConnectionsTracked: staleConnections.size
    });

    // Reset metrics after logging
    Object.keys(performanceMetrics).forEach(key => performanceMetrics[key] = 0);
  } else if (performanceMetrics.totalBroadcasts > 0) {
    // Just reset metrics without logging for low activity periods
    Object.keys(performanceMetrics).forEach(key => performanceMetrics[key] = 0);
  }
}, 60000); // Log every minute

/**
 * Broadcast message to all connections in parallel with performance monitoring
 * @param {Array} connections - Array of connection items
 * @param {Object} message - Message to broadcast
 * @param {string} excludeConnectionId - Connection ID to exclude from broadcast
 */
async function broadcastToConnections(connections, message, excludeConnectionId = null) {
  const startTime = Date.now();
  let failedCount = 0;
  let staleConnectionCount = 0;

  // Filter out known stale connections and excluded connections
  const activeConnections = connections.filter(connection => {
    const targetConnectionId = connection.SK.split("#")[1];
    if (excludeConnectionId && targetConnectionId === excludeConnectionId) {
      return false;
    }
    if (staleConnections.has(targetConnectionId)) {
      return false;
    }
    return true;
  });

  logger.debug(`📡 Broadcasting to ${activeConnections.length}/${connections.length} connections (excluding ${excludeConnectionId || 'none'})`);

  const broadcastPromises = activeConnections.map(async (connection) => {
    const targetConnectionId = connection.SK.split("#")[1];

    const individualStartTime = Date.now();
    try {
      await apig.postToConnection({
        ConnectionId: targetConnectionId,
        Data: JSON.stringify(message),
      }).promise();

      const individualTime = Date.now() - individualStartTime;
      if (individualTime > 100) {
        logger.debug(`  ✅ Sent to ${targetConnectionId} in ${individualTime}ms`);
      }

    } catch (e) {
      failedCount++;
      const individualTime = Date.now() - individualStartTime;

      // If connection is stale, track it and remove from cache
      if (e.statusCode === 410) {
        staleConnections.add(targetConnectionId);
        staleConnectionCount++;
        const cacheKey = `connections_${message.chatRoomId || 'unknown'}`;
        connectionCache.delete(cacheKey);
        logger.debug(`  💀 Connection ${targetConnectionId} is stale (410)`);

        // Proactively clean up stale connection from database
        cleanupStaleConnectionFromDB(message.chatRoomId, targetConnectionId);
      } else {
        logger.warn(`  ❌ Failed to send to ${targetConnectionId} in ${individualTime}ms: ${e.statusCode}`);
      }
    }
  });

  // Wait for all broadcasts to complete
  const settledResults = await Promise.allSettled(broadcastPromises);

  // Update performance metrics
  const broadcastTime = Date.now() - startTime;
  performanceMetrics.totalBroadcasts++;
  performanceMetrics.totalBroadcastTime += broadcastTime;
  performanceMetrics.averageBroadcastTime = performanceMetrics.totalBroadcastTime / performanceMetrics.totalBroadcasts;
  performanceMetrics.failedConnections += failedCount;

  // Only log broadcast results if there are issues or it's slow
  if (failedCount > 0 || broadcastTime > 500) {
    logger.info(`📤 Broadcast completed: ${broadcastTime}ms total, ${failedCount} failures (${staleConnectionCount} stale), ${settledResults.length} attempts`);
  } else {
    logger.debug(`📤 Broadcast completed: ${broadcastTime}ms total, ${settledResults.length} successful`);
  }

  if (broadcastTime > 1000) {
    performanceMetrics.slowBroadcasts++;
    logger.warn(`🐌 Slow broadcast detected: ${broadcastTime}ms for ${connections.length} connections`);
  }
}

/**
 * Proactively clean up a stale connection from the database
 * This runs asynchronously and doesn't block the broadcast
 */
async function cleanupStaleConnectionFromDB(chatRoomId, connectionId) {
  try {
    await dynamodb.delete({
      TableName: DB,
      Key: {
        PK: chatRoomId,
        SK: "CONNECTION#" + connectionId,
      },
    }).promise();

    logger.debug(`🗑️ Proactively cleaned up stale connection ${connectionId} from ${chatRoomId}`);
  } catch (error) {
    // Don't log errors for cleanup failures as they're not critical
    logger.debug(`Failed to cleanup stale connection ${connectionId}:`, error.message);
  }
}

exports.handler = async function (event, context) {
  const handlerStartTime = Date.now();
  const {
    body,
    requestContext: { connectionId, routeKey, identity },
  } = event;
  const timestamp = new Date().getTime();
  let userPK = null,
    bodyAsJSON = null,
    PK = null,
    SK = null,
    senderId = null;
  if (body) {
    bodyAsJSON = JSON.parse(body);
    // userPK = jwt.decode(bodyAsJSON.token, process.env.JWT_SECRET).PK;
    senderId = connectionId;
  }

  // Debug timing for delay analysis
  const debugTiming = {
    handlerStart: handlerStartTime,
    routeKey: routeKey,
    connectionId: connectionId,
    bodySize: body ? body.length : 0
  };
  // Default spawn location - center of the island
  const SPAWN_LOCATION = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
  };

  const MAX_HEALTH = 30;

  const handlePlayerDeath = async (connectionId, chatRoomId) => {
    try {
      // 1. Get player's current inventory before death
      const playerParams = {
        TableName: process.env.DB,
        Key: {
          PK: chatRoomId,
          SK: "CONNECTION#" + connectionId,
        },
      };

      const playerData = await dynamodb.get(playerParams).promise();

      if (playerData.Item) {
        const player = playerData.Item;
        const deathPosition = player.lastValidPosition || SPAWN_LOCATION.position;

        // Drop all inventory items at death location
        const berryTypes = ['blueberry', 'strawberry', 'greenberry', 'goldberry'];
        const droppedItems = [];

        for (const berryType of berryTypes) {
          const berryField = `berries_${berryType}`;
          const quantity = player[berryField] || 0;

          if (quantity > 0) {
            // Create ground item for each berry type
            const groundItemId = `GROUND_ITEM#${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            await dynamodb.put({
              TableName: process.env.DB,
              Item: {
                PK: chatRoomId,
                SK: groundItemId,
                itemType: 'berry',
                itemSubType: berryType,
                quantity,
                position: {
                  x: deathPosition.x + (Math.random() - 0.5) * 2, // Scatter items slightly
                  y: deathPosition.y,
                  z: deathPosition.z + (Math.random() - 0.5) * 2,
                },
                droppedBy: connectionId,
                droppedAt: Date.now(),
                droppedOnDeath: true,
                ttl: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
              },
            }).promise();

            droppedItems.push({
              id: groundItemId,
              itemType: 'berry',
              itemSubType: berryType,
              quantity,
              position: {
                x: deathPosition.x + (Math.random() - 0.5) * 2,
                y: deathPosition.y,
                z: deathPosition.z + (Math.random() - 0.5) * 2,
              },
              droppedBy: connectionId,
              droppedAt: Date.now(),
              droppedOnDeath: true,
            });
          }
        }

      // Reset player's inventory and health/position
      const respawnParams = {
        TableName: process.env.DB,
        Key: {
          PK: chatRoomId,
          SK: "CONNECTION#" + connectionId,
        },
        UpdateExpression: "SET health = :health, #pos = :position, #rot = :rotation, berries = :zero, berries_blueberry = :zero, berries_strawberry = :zero, berries_greenberry = :zero, berries_goldberry = :zero",
        ExpressionAttributeNames: {
          "#pos": "position",
          "#rot": "rotation"
        },
        ExpressionAttributeValues: {
          ":health": MAX_HEALTH,
          ":position": SPAWN_LOCATION.position,
          ":rotation": SPAWN_LOCATION.rotation,
          ":zero": 0,
        },
      };

      // 1. Respawn the player
      await dynamodb.update(respawnParams).promise();
      logger.info(`Player ${connectionId} respawned successfully, dropped ${droppedItems.length} item stacks`);

      // 2. Get all connections to broadcast death/respawn event
      const connections = await getCachedConnections(chatRoomId);

      // 3. Broadcast death/respawn event and dropped items to all connected players
      const deathMessage = {
        type: "playerDeath",
        deadPlayerId: connectionId,
        respawnLocation: SPAWN_LOCATION,
        droppedItems: droppedItems,
        timestamp: Date.now(),
        chatRoomId: chatRoomId,
      };

      const respawnMessage = {
        type: "playerRespawn",
        playerId: connectionId,
        health: MAX_HEALTH,
        position: SPAWN_LOCATION.position,
        rotation: SPAWN_LOCATION.rotation,
        timestamp: Date.now(),
        chatRoomId: chatRoomId,
      };

      // Broadcast death and respawn events in parallel
      await Promise.all([
        broadcastToConnections(connections, deathMessage),
        broadcastToConnections(connections, respawnMessage)
      ]);

      // Broadcast ground item creation events for each dropped item
      const groundItemPromises = droppedItems.map(droppedItem =>
        broadcastToConnections(connections, {
          type: "groundItemCreated",
          groundItem: droppedItem,
          timestamp: Date.now(),
          chatRoomId: chatRoomId,
        })
      );

      await Promise.all(groundItemPromises);
      }

    } catch (error) {
      console.error(`Error handling player death for ${connectionId}:`, error);
    }
  };

  const dealDamage = async (connectionId, damage, chatRoomId) => {
    const rowParams = {
      TableName: process.env.DB,
      Key: {
        PK: chatRoomId,
        SK: "CONNECTION#" + connectionId,
      },
      UpdateExpression: "SET health = health - :val",
      ExpressionAttributeValues: {
        ":val": damage,
      },
      ReturnValues: "ALL_NEW"
    };

    try {
      const updateResult = await dynamodb.update(rowParams).promise();
      const newHealth = updateResult.Attributes.health;

      console.log(`Player ${connectionId} took ${damage} damage, new health: ${newHealth}`);

      // Broadcast health update to all players
      const connections = await getCachedConnections(chatRoomId);
      const healthUpdateMessage = {
        playerHealthUpdate: true,
        playerId: connectionId,
        newHealth: newHealth,
        timestamp: Date.now(),
        chatRoomId: chatRoomId,
      };

      await broadcastToConnections(connections, healthUpdateMessage);

      // Check for death after dealing damage
      if (newHealth <= 0) {
        await handlePlayerDeath(connectionId, chatRoomId);
      }
    } catch (e) {
      console.error(
        "Unable to update item. Error JSON:",
        JSON.stringify(e, null, 2)
      );
    }
  };

  switch (routeKey) {
    case "$connect":
      break;

    case "$disconnect":
      try {
        // Clean up user data when they disconnect
        logger.info(`🔌 User ${connectionId} disconnecting, cleaning up...`);

        // Remove from stale connections set if present
        staleConnections.delete(connectionId);

        // Find all chat rooms this connection was part of and clean up
        const scanParams = {
          TableName: DB,
          FilterExpression: "SK = :sk",
          ExpressionAttributeValues: {
            ":sk": "CONNECTION#" + connectionId,
          },
        };

        const scanResult = await dynamodb.scan(scanParams).promise();

        for (const item of scanResult.Items) {
          const chatRoomId = item.PK;

          // Delete the connection record
          await dynamodb.delete({
            TableName: DB,
            Key: {
              PK: chatRoomId,
              SK: "CONNECTION#" + connectionId,
            },
          }).promise();

          // Clear cache for this chat room to force refresh
          const cacheKey = `connections_${chatRoomId}`;
          connectionCache.delete(cacheKey);

          logger.debug(`🧹 Cleaned up connection ${connectionId} from ${chatRoomId}`);
        }

        logger.info(`✅ Cleanup completed for ${connectionId} (${scanResult.Items.length} rooms)`);
      } catch (e) {
        logger.error("Error during disconnect cleanup:", e);
      }
      break;

    // const samplePayload = {
    //   "action": "connectToChatRoom",
    //   "chatRoomId": "CHATROOM#123"
    //   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJQSyI6IlVTRVIjZmNjMmNjNTAtZGNiOC0xMWViLWJjOWItZTFkNmIwNmI3ZGIzIiwiaWF0IjoxNjI1NjY0MjEwfQ.CI8C_oZpDfIETQOHktt4HkIlBEhn_2jy7dLwd0b0zPM"
    // }
    case "connectToChatRoom":
      SK = "CONNECTION#" + connectionId;
      PK = bodyAsJSON.chatRoomId; //TODO: Auth check
      await dynamodb
        .put({
          TableName: DB,
          Item: {
            PK,
            SK,
            created: timestamp,
            ttl: Math.floor(new Date().getTime() / 1000) + 360, // 6 mins from now?
            health: MAX_HEALTH,
            berries: 0, // Initialize total berry count
            berries_blueberry: 0,
            berries_strawberry: 0,
            berries_greenberry: 0,
            berries_goldberry: 0,
            // Position validation fields
            lastValidPosition: SPAWN_LOCATION.position,
            lastPositionUpdate: timestamp,
            positionHistory: [{ position: SPAWN_LOCATION.position, timestamp }],
            violationCount: 0,
            lastViolationTime: 0,
            updateCount: 0,
          },
        })
        .promise();
      //Get all connectionIDs associated with chatroom to send back to user
      const getConnections = await getCachedConnections(bodyAsJSON.chatRoomId, true); // Force refresh on connect
      try {
        await apig
          .postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({
              yourConnectionId: senderId,
              connections: getConnections,
            }),
          })
          .promise();
      } catch (e) {
        // Silently handle connection errors
      }

      // Send inventory state to the connecting player
      const playerConnection = getConnections.find(
        conn => conn.SK === "CONNECTION#" + connectionId
      );

      if (playerConnection) {
        const inventoryData = {
          berries: playerConnection.berries || 0,
          berries_blueberry: playerConnection.berries_blueberry || 0,
          berries_strawberry: playerConnection.berries_strawberry || 0,
          berries_greenberry: playerConnection.berries_greenberry || 0,
          berries_goldberry: playerConnection.berries_goldberry || 0,
        };

        try {
          await apig
            .postToConnection({
              ConnectionId: connectionId,
              Data: JSON.stringify({
                inventorySync: true,
                inventory: inventoryData,
                timestamp: Date.now(),
              }),
            })
            .promise();
        } catch (e) {
          // Silently handle connection errors
        }
      }
      break;

    // const samplePayload = {
    //   "message": "yo whats up?",
    //   "action": "sendMessagePublic",
    //   "chatRoomId": "CHATROOM#1234567",
    //   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJQSyI6IlVTRVIjZmNjMmNjNTAtZGNiOC0xMWViLWJjOWItZTFkNmIwNmI3ZGIzIiwiaWF0IjoxNjI1NjY0MjEwfQ.CI8C_oZpDfIETQOHktt4HkIlBEhn_2jy7dLwd0b0zPM"
    // }
    case "sendMessagePublic":
      try {
        //Get all connectionIDs associated with chatroom
        const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

        //Send message to socket connections in parallel
        const message = {
          message: bodyAsJSON.message,
          senderId,
          chatMessage: true,
          timestamp: Date.now(),
          chatRoomId: bodyAsJSON.chatRoomId,
        };

        await broadcastToConnections(connections, message);
      } catch (e) {
        logger.error("sendMessagePublic error:", e);
      }
      break;

    case "sendUpdate": //TODO: rename to send update
      try {
        const caseStartTime = Date.now();
        const currentTimestamp = Date.now();
        const incomingPosition = bodyAsJSON.message.position;

        console.log(`🔍 [${connectionId}] SendUpdate started at ${caseStartTime}`);

        // Validate position update
        const validationStartTime = Date.now();
        const validationResult = await positionValidator.validatePositionUpdate(
          connectionId,
          bodyAsJSON.chatRoomId,
          incomingPosition,
          currentTimestamp
        );
        const validationTime = Date.now() - validationStartTime;
        if (validationTime > 50) {
          logger.debug(`⚡ [${connectionId}] Position validation took ${validationTime}ms`);
        }

        // If position is invalid, send correction back to the client
        if (!validationResult.valid) {
          logger.warn(`❌ [${connectionId}] Position validation failed: ${validationResult.reason}`);
          // Send position correction to the offending client
          try {
            await apig
              .postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                  type: "positionCorrection",
                  correctedPosition: validationResult.correctedPosition,
                  reason: validationResult.reason,
                  timestamp: currentTimestamp
                }),
              })
              .promise();
          } catch (e) {
            // Silently handle connection errors
          }

          // Don't broadcast invalid position to other players
          return { statusCode: 200 };
        }

        // Use the validated/corrected position for broadcasting
        bodyAsJSON.message.position = validationResult.correctedPosition;
        bodyAsJSON.message.serverValidated = true;
        bodyAsJSON.message.validationTimestamp = currentTimestamp;

        //TODO VERIFY CAN ATTACK (SECURITY)
        const attackingPlayer = bodyAsJSON.message.attackingPlayer;
        let damage = 0;
        if (attackingPlayer) {
          damage = Math.floor(Math.random() * 3) + 1;
          bodyAsJSON.message.damageGiven = {
            receivingPlayer: attackingPlayer,
            damage,
          };
          await dealDamage(attackingPlayer, damage, bodyAsJSON.chatRoomId);
        }

        // Broadcast validated position to other players in parallel
        const broadcastStartTime = Date.now();
        bodyAsJSON.message.connectionId = connectionId;
        bodyAsJSON.message.userId = senderId;
        bodyAsJSON.message.chatRoomId = bodyAsJSON.chatRoomId;

        // Create connection objects from connection IDs for broadcasting
        const connectionObjects = bodyAsJSON.connections.map(connId => ({
          SK: `CONNECTION#${connId}`
        }));

        logger.debug(`📡 [${connectionId}] Broadcasting to ${connectionObjects.length} connections...`);
        // Don't exclude the attacker from receiving attack messages - they need to see damage numbers
        await broadcastToConnections(connectionObjects, bodyAsJSON.message);

        const broadcastTime = Date.now() - broadcastStartTime;
        const totalTime = Date.now() - caseStartTime;

        if (broadcastTime > 100 || totalTime > 200) {
          logger.debug(`📤 [${connectionId}] Broadcast completed in ${broadcastTime}ms`);
          logger.debug(`🏁 [${connectionId}] Total sendUpdate time: ${totalTime}ms (validation: ${validationTime}ms, broadcast: ${broadcastTime}ms)`);
        }

      } catch (e) {
        logger.error("SendUpdate error:", e);
      }
      break;

    case "startHarvest":
      try {
        const treeId = bodyAsJSON.treeId;
        const berryType = bodyAsJSON.berryType || 'blueberry';
        const harvestDuration = Math.floor(Math.random() * 8) + 3; // 3-10 seconds

        // Store harvest start time in database
        await dynamodb
          .put({
            TableName: DB,
            Item: {
              PK: bodyAsJSON.chatRoomId,
              SK: `HARVEST#${treeId}#${connectionId}`,
              treeId,
              berryType,
              playerId: connectionId,
              startTime: timestamp,
              duration: harvestDuration,
              ttl: Math.floor(new Date().getTime() / 1000) + 600, // 10 mins from now
            },
          })
          .promise();

        // Get all connections to broadcast harvest start
        const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

        // Broadcast harvest started to all players in parallel
        const harvestStartMessage = {
          harvestStarted: true,
          treeId,
          berryType,
          playerId: connectionId,
          duration: harvestDuration,
          timestamp: Date.now(),
          chatRoomId: bodyAsJSON.chatRoomId,
        };

        await broadcastToConnections(connections, harvestStartMessage);

        // Schedule harvest completion
        setTimeout(async () => {
          try {
            // Check if harvest is still active (not cancelled)
            const harvestCheck = await dynamodb
              .get({
                TableName: DB,
                Key: {
                  PK: bodyAsJSON.chatRoomId,
                  SK: `HARVEST#${treeId}#${connectionId}`,
                },
              })
              .promise();

            if (harvestCheck.Item) {
              const harvestBerryType = harvestCheck.Item.berryType || 'blueberry';

              // Remove harvest record
              await dynamodb
                .delete({
                  TableName: DB,
                  Key: {
                    PK: bodyAsJSON.chatRoomId,
                    SK: `HARVEST#${treeId}#${connectionId}`,
                  },
                })
                .promise();

              // Add berry to player's inventory - update specific berry type counter
              const berryField = `berries_${harvestBerryType}`;
              await dynamodb
                .update({
                  TableName: DB,
                  Key: {
                    PK: bodyAsJSON.chatRoomId,
                    SK: "CONNECTION#" + connectionId,
                  },
                  UpdateExpression: `ADD ${berryField} :val, berries :val`,
                  ExpressionAttributeValues: {
                    ":val": 1,
                  },
                })
                .promise();

              // Broadcast harvest completion in parallel
              const connectionsForCompletion = await getCachedConnections(bodyAsJSON.chatRoomId);
              const harvestCompleteMessage = {
                harvestCompleted: true,
                treeId,
                berryType: harvestBerryType,
                playerId: connectionId,
                timestamp: Date.now(),
                chatRoomId: bodyAsJSON.chatRoomId,
              };

              await broadcastToConnections(connectionsForCompletion, harvestCompleteMessage);
            }
          } catch (e) {
            console.error("Error completing harvest:", e);
          }
        }, harvestDuration * 1000);

      } catch (e) {
        console.error("Error starting harvest:", e);
      }
      break;

    case "completeHarvest":
      try {
        const treeId = bodyAsJSON.treeId;

        // Check if harvest record exists and belongs to this player
        const harvestCheck = await dynamodb
          .get({
            TableName: DB,
            Key: {
              PK: bodyAsJSON.chatRoomId,
              SK: `HARVEST#${treeId}#${connectionId}`,
            },
          })
          .promise();

        if (harvestCheck.Item) {
          const harvestBerryType = harvestCheck.Item.berryType || 'blueberry';
          const harvestStartTime = harvestCheck.Item.startTime;
          const harvestDuration = harvestCheck.Item.duration;
          const currentTime = Date.now();

          // Verify harvest has been running long enough (prevent early completion)
          const elapsedTime = currentTime - harvestStartTime;
          if (elapsedTime < (harvestDuration * 1000 - 500)) { // Allow 500ms tolerance
            break;
          }

          // Remove harvest record
          await dynamodb
            .delete({
              TableName: DB,
              Key: {
                PK: bodyAsJSON.chatRoomId,
                SK: `HARVEST#${treeId}#${connectionId}`,
              },
            })
            .promise();

          // Add berry to player's inventory
          const berryField = `berries_${harvestBerryType}`;
          await dynamodb
            .update({
              TableName: DB,
              Key: {
                PK: bodyAsJSON.chatRoomId,
                SK: "CONNECTION#" + connectionId,
              },
              UpdateExpression: `ADD ${berryField} :val, berries :val`,
              ExpressionAttributeValues: {
                ":val": 1,
              },
            })
            .promise();

          // Get all connections to broadcast completion
          const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

          // Broadcast harvest completion in parallel
          const harvestCompleteMessage = {
            harvestCompleted: true,
            treeId,
            berryType: harvestBerryType,
            playerId: connectionId,
            timestamp: Date.now(),
            chatRoomId: bodyAsJSON.chatRoomId,
          };

          await broadcastToConnections(connections, harvestCompleteMessage);
        } else {
          // No active harvest found
        }
      } catch (e) {
        logger.error("Error in manual harvest completion:", e);
      }
      break;

    case "cancelHarvest":
      try {
        const treeId = bodyAsJSON.treeId;

        // Remove harvest record if it exists
        await dynamodb
          .delete({
            TableName: DB,
            Key: {
              PK: bodyAsJSON.chatRoomId,
              SK: `HARVEST#${treeId}#${connectionId}`,
            },
          })
          .promise();

        // Get all connections to broadcast cancellation
        const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

        // Broadcast harvest cancellation in parallel
        const harvestCancelMessage = {
          harvestCancelled: true,
          treeId,
          playerId: connectionId,
          timestamp: Date.now(),
          chatRoomId: bodyAsJSON.chatRoomId,
        };

        await broadcastToConnections(connections, harvestCancelMessage);
      } catch (e) {
        logger.error("Error cancelling harvest:", e);
      }
      break;

    case "consumeBerry":
      try {
        const berryType = bodyAsJSON.berryType;

        // Get player's current state from database
        const playerParams = {
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
        };
        const playerData = await dynamodb.get(playerParams).promise();

        if (playerData.Item) {
          const currentHealth = playerData.Item.health || 0;
          const berryField = `berries_${berryType}`;
          const berryCount = playerData.Item[berryField] || 0;

          // Check if player has the berry
          if (berryCount <= 0) {
            break;
          }

          // Calculate health restoration based on berry type
          let healthRestore = 0;
          switch (berryType) {
            case 'blueberry':
              healthRestore = 5;
              break;
            case 'strawberry':
            case 'greenberry':
            case 'goldberry':
              // Placeholder for other berry types
              healthRestore = 1;
              break;
            default:
              healthRestore = 1;
          }

          // Calculate new health (don't exceed max)
          const newHealth = Math.min(currentHealth + healthRestore, MAX_HEALTH);

          // Update player's health and consume berry
          await dynamodb
            .update({
              TableName: DB,
              Key: {
                PK: bodyAsJSON.chatRoomId,
                SK: "CONNECTION#" + connectionId,
              },
              UpdateExpression: `SET health = :newHealth ADD ${berryField} :consumeVal, berries :consumeVal`,
              ExpressionAttributeValues: {
                ":newHealth": newHealth,
                ":consumeVal": -1,
              },
            })
            .promise();

          // Berry consumed successfully

          // Send health update back to the consuming player
          try {
            await apig
              .postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                  berryConsumed: true,
                  berryType: berryType,
                  healthRestored: healthRestore,
                  newHealth: newHealth,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            // Silently handle connection errors
          }

          // Get all connections to broadcast health update to other players
          const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

          // Broadcast health update to other players in parallel
          const healthUpdateMessage = {
            playerHealthUpdate: true,
            playerId: connectionId,
            newHealth: newHealth,
            timestamp: Date.now(),
            chatRoomId: bodyAsJSON.chatRoomId,
          };

          await broadcastToConnections(connections, healthUpdateMessage, connectionId);
        }
      } catch (e) {
        console.error("Error consuming berry:", e);
      }
      break;

    case "validateInventory":
      try {
        // Get player's current inventory from database
        const playerParams = {
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
        };
        const playerData = await dynamodb.get(playerParams).promise();

        if (playerData.Item) {
          const serverInventory = {
            berries: playerData.Item.berries || 0,
            berries_blueberry: playerData.Item.berries_blueberry || 0,
            berries_strawberry: playerData.Item.berries_strawberry || 0,
            berries_greenberry: playerData.Item.berries_greenberry || 0,
            berries_goldberry: playerData.Item.berries_goldberry || 0,
          };

          // Send authoritative inventory state back to client
          try {
            await apig
              .postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                  inventoryValidation: true,
                  inventory: serverInventory,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            console.log("couldn't send inventory validation to " + connectionId, e);
          }
        }
      } catch (e) {
        console.error("Error validating inventory:", e);
      }
      break;

    case "requestInventorySync":
      try {
        // Force inventory synchronization - same as validateInventory but with different message type
        const playerParams = {
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
        };
        const playerData = await dynamodb.get(playerParams).promise();

        if (playerData.Item) {
          const serverInventory = {
            berries: playerData.Item.berries || 0,
            berries_blueberry: playerData.Item.berries_blueberry || 0,
            berries_strawberry: playerData.Item.berries_strawberry || 0,
            berries_greenberry: playerData.Item.berries_greenberry || 0,
            berries_goldberry: playerData.Item.berries_goldberry || 0,
          };

          try {
            await apig
              .postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                  inventorySync: true,
                  inventory: serverInventory,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            console.log("couldn't send inventory sync to " + connectionId, e);
          }
        }
      } catch (e) {
        console.error("Error syncing inventory:", e);
      }
      break;

    case "validateGameState":
      try {
        // Get player's current state from database
        const playerParams = {
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
        };
        const playerData = await dynamodb.get(playerParams).promise();

        // Get active harvests for this player
        const harvestParams = {
          TableName: DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": `HARVEST#`,
          },
        };
        const harvestData = await dynamodb.query(harvestParams).promise();

        // Filter harvests for this player
        const playerHarvests = harvestData.Items.filter(
          harvest => harvest.playerId === connectionId
        );

        // Get all ground items in the chatroom
        const groundItemParams = {
          TableName: DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": "GROUND_ITEM#",
          },
        };
        const groundItemData = await dynamodb.query(groundItemParams).promise();

        if (playerData.Item) {
          const gameState = {
            inventory: {
              berries: playerData.Item.berries || 0,
              berries_blueberry: playerData.Item.berries_blueberry || 0,
              berries_strawberry: playerData.Item.berries_strawberry || 0,
              berries_greenberry: playerData.Item.berries_greenberry || 0,
              berries_goldberry: playerData.Item.berries_goldberry || 0,
            },
            activeHarvests: playerHarvests.map(harvest => ({
              treeId: harvest.treeId,
              berryType: harvest.berryType,
              startTime: harvest.startTime,
              duration: harvest.duration,
              playerId: harvest.playerId,
            })),
            groundItems: groundItemData.Items.map(item => ({
              id: item.SK,
              itemType: item.itemType,
              itemSubType: item.itemSubType,
              quantity: item.quantity,
              position: item.position,
              droppedBy: item.droppedBy,
              droppedAt: item.droppedAt,
              droppedOnDeath: item.droppedOnDeath || false,
            })),
            health: playerData.Item.health || 30,
            position: playerData.Item.lastValidPosition || { x: 0, y: 0, z: 0 },
          };

          // Send comprehensive game state back to client
          try {
            await apig
              .postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                  gameStateValidation: true,
                  gameState: gameState,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            console.log("couldn't send game state validation to " + connectionId, e);
          }
        }
      } catch (e) {
        console.error("Error validating game state:", e);
      }
      break;

    case "dropItem":
      try {
        const { itemType, itemSubType, quantity = 1, position } = bodyAsJSON;

        if (!itemType || !position) {
          console.error("Missing required fields for dropItem");
          break;
        }

        // Get player's current inventory
        const playerParams = {
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
        };
        const playerData = await dynamodb.get(playerParams).promise();

        if (!playerData.Item) {
          console.error("Player not found for dropItem");
          break;
        }

        // Check if player has the item to drop
        const berryField = `berries_${itemSubType}`;
        const currentQuantity = playerData.Item[berryField] || 0;

        if (currentQuantity < quantity) {
          console.error(`Player doesn't have enough ${itemSubType} to drop`);
          break;
        }

        // Remove item from player's inventory
        await dynamodb.update({
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
          UpdateExpression: `ADD ${berryField} :negQuantity, berries :negQuantity`,
          ExpressionAttributeValues: {
            ":negQuantity": -quantity,
          },
        }).promise();

        // Create ground item
        const groundItemId = `GROUND_ITEM#${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await dynamodb.put({
          TableName: DB,
          Item: {
            PK: bodyAsJSON.chatRoomId,
            SK: groundItemId,
            itemType,
            itemSubType,
            quantity,
            position,
            droppedBy: connectionId,
            droppedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
          },
        }).promise();

        // Broadcast ground item creation to all players in parallel
        const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

        const groundItemMessage = {
          type: "groundItemCreated",
          groundItem: {
            id: groundItemId,
            itemType,
            itemSubType,
            quantity,
            position,
            droppedBy: connectionId,
            droppedAt: Date.now(),
          },
          timestamp: Date.now(),
          chatRoomId: bodyAsJSON.chatRoomId,
        };

        await broadcastToConnections(connections, groundItemMessage);

        console.log(`Player ${connectionId} dropped ${quantity} ${itemSubType} at position`, position);

      } catch (e) {
        console.error("Error dropping item:", e);
      }
      break;

    case "pickupItem":
      try {
        const { groundItemId } = bodyAsJSON;

        if (!groundItemId) {
          console.error("Missing groundItemId for pickupItem");
          break;
        }

        // Get ground item
        const groundItemParams = {
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: groundItemId,
          },
        };

        const groundItemData = await dynamodb.get(groundItemParams).promise();

        if (!groundItemData.Item) {
          console.error("Ground item not found for pickup");
          break;
        }

        const groundItem = groundItemData.Item;

        // Add item to player's inventory
        const berryField = `berries_${groundItem.itemSubType}`;
        await dynamodb.update({
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: "CONNECTION#" + connectionId,
          },
          UpdateExpression: `ADD ${berryField} :quantity, berries :quantity`,
          ExpressionAttributeValues: {
            ":quantity": groundItem.quantity,
          },
        }).promise();

        // Remove ground item
        await dynamodb.delete({
          TableName: DB,
          Key: {
            PK: bodyAsJSON.chatRoomId,
            SK: groundItemId,
          },
        }).promise();

        // Broadcast ground item removal to all players in parallel
        const connections = await getCachedConnections(bodyAsJSON.chatRoomId);

        const groundItemRemovalMessage = {
          type: "groundItemRemoved",
          groundItemId,
          pickedUpBy: connectionId,
          timestamp: Date.now(),
          chatRoomId: bodyAsJSON.chatRoomId,
        };

        await broadcastToConnections(connections, groundItemRemovalMessage);

        logger.debug(`Player ${connectionId} picked up ${groundItem.quantity} ${groundItem.itemSubType}`);

      } catch (e) {
        logger.error("Error picking up item:", e);
      }
      break;
  }

  // Return a 200 status to tell API Gateway the message was processed
  // successfully.
  // Otherwise, API Gateway will return a 500 to the client.
  return { statusCode: 200 };
};

// /openChatRoom - get messages for chatroom
// header: token
// body: {
//       chatRoomId: xxx
// }
module.exports.openChatRoom = async (event, context, callback) => {
  if (typeof event === "string") event = JSON.parse(event);
  const data = JSON.parse(event.body);

  const decoded = jwt.decode(
    event.headers.Authorization,
    process.env.JWT_SECRET
  );
  try {
    const params = {
      TableName: process.env.DB,
      KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": data.chatRoomId, ":sk": "MESSAGE#" },
    };
    const getMessages = await dynamodb.query(params).promise();
    callback(
      null,
      helpers.validCallbackObject({ messages: getMessages.Items })
    );
  } catch (e) {
    console.error(e);
  }
};

// /getChatRooms - get chat rooms for user
// header: token
module.exports.getChatRooms = async (event, context, callback) => {
  if (typeof event === "string") event = JSON.parse(event);
  const data = JSON.parse(event.body);

  const decoded = jwt.decode(
    event.headers.Authorization,
    process.env.JWT_SECRET
  );
  try {
    const getChatRoomsParams = {
      TableName: process.env.DB,
      KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": decoded.PK, ":sk": "CHATROOM#" },
    };
    let chatRooms = await dynamodb.query(getChatRoomsParams).promise();
    for (let chatRoom of chatRooms.Items) {
      const getChatRoomUsersParams = {
        TableName: process.env.DB,
        KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": chatRoom.SK, ":sk": "USER#" },
      };
      const chatRoomUsers = await dynamodb
        .query(getChatRoomUsersParams)
        .promise();
      // Avoid sending back user guid
      chatRoomUsers.Items.forEach((x) => delete x.SK);
      chatRoom.users = chatRoomUsers.Items;
    }

    // Avoid sending back user guid
    chatRooms.Items.forEach((x) => delete x.PK);
    callback(null, helpers.validCallbackObject({ rooms: chatRooms.Items }));
  } catch (e) {
    console.error(e);
  }
};

// /createChatRoom - creates rows in db necessary for chatroom
// header: token
// body: {
//   name: "chatroomName"
// }
module.exports.createChatRoom = async (event, context, callback) => {
  if (typeof event === "string") event = JSON.parse(event);
  const data = JSON.parse(event.body);

  const decoded = jwt.decode(
    event.headers.Authorization,
    process.env.JWT_SECRET
  );

  try {
    const chatRoomId = "CHATROOM#" + uuid.v1();
    const timestamp = new Date().getTime();

    const getHandleParams = {
      TableName: process.env.DB,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": decoded.PK },
    };
    const getHandle = await dynamodb.query(getHandleParams).promise();
    const handle = getHandle.Items[0].handle;
    const roomParams = {
      TableName: process.env.DB,
      Item: {
        PK: chatRoomId,
        SK: decoded.PK,
        handle: handle,
        name: data.name,
        modified: timestamp,
      },
    };
    await dynamodb.put(roomParams).promise();

    const userParams = {
      TableName: process.env.DB,
      Item: {
        PK: decoded.PK,
        SK: chatRoomId,
        handle: handle,
        created: timestamp,
      },
    };
    await dynamodb.put(userParams).promise();

    callback(null, helpers.validCallbackObject({ chatRoomId }));
  } catch (e) {
    console.error(e);
    callback(null, helpers.invalidCallbackObject("Failed to create chatroom"));
  }
};
