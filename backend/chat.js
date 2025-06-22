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

exports.handler = async function (event, context) {
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
      console.log(`Player ${connectionId} respawned successfully, dropped ${droppedItems.length} item stacks`);

      // 2. Get all connections to broadcast death/respawn event
      const usersParams = {
        TableName: process.env.DB,
        KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": chatRoomId,
          ":sk": "CONNECTION#",
        },
      };

      const getConnections = await dynamodb.query(usersParams).promise();

      // 3. Broadcast death/respawn event and dropped items to all connected players
      const deathMessage = {
        type: "playerDeath",
        deadPlayerId: connectionId,
        respawnLocation: SPAWN_LOCATION,
        droppedItems: droppedItems,
        timestamp: Date.now(),
      };

      const respawnMessage = {
        type: "playerRespawn",
        playerId: connectionId,
        health: MAX_HEALTH,
        position: SPAWN_LOCATION.position,
        rotation: SPAWN_LOCATION.rotation,
        timestamp: Date.now(),
      };

      // Send death event and dropped items to all players
      for (const connection of getConnections.Items) {
        const targetConnectionId = connection.SK.split("#")[1];
        try {
          await apig
            .postToConnection({
              ConnectionId: targetConnectionId,
              Data: JSON.stringify(deathMessage),
            })
            .promise();

          // Send respawn event immediately after death event
          await apig
            .postToConnection({
              ConnectionId: targetConnectionId,
              Data: JSON.stringify(respawnMessage),
            })
            .promise();

          // Send individual ground item creation events for each dropped item
          for (const droppedItem of droppedItems) {
            await apig
              .postToConnection({
                ConnectionId: targetConnectionId,
                Data: JSON.stringify({
                  type: "groundItemCreated",
                  groundItem: droppedItem,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          }
        } catch (e) {
          console.log(`Couldn't send death/respawn message to ${targetConnectionId}:`, e);
        }
      }
      }

    } catch (error) {
      console.error(`Error handling player death for ${connectionId}:`, error);
    }
  };

  const dealDamage = (connectionId, damage, chatRoomId) => {
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
    };

    dynamodb.update(rowParams, (e, data) => {
      if (e) {
        console.error(
          "Unable to update item. Error JSON:",
          JSON.stringify(e, null, 2)
        );
        return;
      }

      // Check for death after dealing damage
      dynamodb.get(rowParams, async (err, data) => {
        if (err) {
          console.error("Couldn't get user item after deal damage:", err);
        } else {
          if (data.Item?.health <= 0) {
            await handlePlayerDeath(connectionId, chatRoomId);
          }
        }
      });
    });
  };

  switch (routeKey) {
    case "$connect":
      break;

    case "$disconnect":
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
      const usersParams = {
        TableName: process.env.DB,
        KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": bodyAsJSON.chatRoomId,
          ":sk": "CONNECTION#",
        },
      };
      const getConnections = await dynamodb.query(usersParams).promise();
      try {
        await apig
          .postToConnection({
            ConnectionId: connectionId,
            Data: JSON.stringify({
              yourConnectionId: senderId,
              connections: getConnections.Items,
            }),
          })
          .promise();
      } catch (e) {
        // Silently handle connection errors
      }

      // Send inventory state to the connecting player
      const playerConnection = getConnections.Items.find(
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
        const usersParams = {
          TableName: process.env.DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": "CONNECTION#",
          },
        };
        const getConnections = await dynamodb.query(usersParams).promise();
        //Send message to socket connections
        for (const connection of getConnections.Items) {
          const connectionId = connection.SK.split("#")[1];
          try {
            await apig
              .postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                  message: bodyAsJSON.message,
                  senderId,
                  chatMessage: true,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            // Silently handle connection errors
          }
        }
      } catch (e) {
        console.error(e);
      }
      break;

    case "sendUpdate": //TODO: rename to send update
      try {
        const currentTimestamp = Date.now();
        const incomingPosition = bodyAsJSON.message.position;

        // Validate position update
        const validationResult = await positionValidator.validatePositionUpdate(
          connectionId,
          bodyAsJSON.chatRoomId,
          incomingPosition,
          currentTimestamp
        );

        // If position is invalid, send correction back to the client
        if (!validationResult.valid) {
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
          dealDamage(attackingPlayer, damage, bodyAsJSON.chatRoomId);
        }

        // Broadcast validated position to other players
        for (const otherConnectionId of bodyAsJSON.connections) {
          bodyAsJSON.message.connectionId = connectionId;
          bodyAsJSON.message.userId = senderId;
          try {
            await apig
              .postToConnection({
                ConnectionId: otherConnectionId,
                Data: JSON.stringify(bodyAsJSON.message),
              })
              .promise();
          } catch (e) {
            // Silently handle connection errors
          }
        }
      } catch (e) {
        console.error("SendUpdate error:", e);
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
        const usersParams = {
          TableName: DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": "CONNECTION#",
          },
        };
        const getConnections = await dynamodb.query(usersParams).promise();

        // Broadcast harvest started to all players
        for (const connection of getConnections.Items) {
          const targetConnectionId = connection.SK.split("#")[1];
          try {
            await apig
              .postToConnection({
                ConnectionId: targetConnectionId,
                Data: JSON.stringify({
                  harvestStarted: true,
                  treeId,
                  berryType,
                  playerId: connectionId,
                  duration: harvestDuration,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            console.log("couldn't send harvest start message to " + targetConnectionId, e);
          }
        }

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

              // Broadcast harvest completion
              const getConnectionsForCompletion = await dynamodb.query(usersParams).promise();
              for (const connection of getConnectionsForCompletion.Items) {
                const targetConnectionId = connection.SK.split("#")[1];
                try {
                  await apig
                    .postToConnection({
                      ConnectionId: targetConnectionId,
                      Data: JSON.stringify({
                        harvestCompleted: true,
                        treeId,
                        berryType: harvestBerryType,
                        playerId: connectionId,
                        timestamp: Date.now(),
                      }),
                    })
                    .promise();
                } catch (e) {
                  console.log("couldn't send harvest completion message to " + targetConnectionId, e);
                }
              }
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
          const usersParams = {
            TableName: DB,
            KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": bodyAsJSON.chatRoomId,
              ":sk": "CONNECTION#",
            },
          };
          const getConnections = await dynamodb.query(usersParams).promise();

          // Broadcast harvest completion
          for (const connection of getConnections.Items) {
            const targetConnectionId = connection.SK.split("#")[1];
            try {
              await apig
                .postToConnection({
                  ConnectionId: targetConnectionId,
                  Data: JSON.stringify({
                    harvestCompleted: true,
                    treeId,
                    berryType: harvestBerryType,
                    playerId: connectionId,
                    timestamp: Date.now(),
                  }),
                })
                .promise();
            } catch (e) {
              console.log("couldn't send harvest completion message to " + targetConnectionId, e);
            }
          }
        } else {
          // No active harvest found
        }
      } catch (e) {
        console.error("Error in manual harvest completion:", e);
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
        const usersParams = {
          TableName: DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": "CONNECTION#",
          },
        };
        const getConnections = await dynamodb.query(usersParams).promise();

        // Broadcast harvest cancellation
        for (const connection of getConnections.Items) {
          const targetConnectionId = connection.SK.split("#")[1];
          try {
            await apig
              .postToConnection({
                ConnectionId: targetConnectionId,
                Data: JSON.stringify({
                  harvestCancelled: true,
                  treeId,
                  playerId: connectionId,
                  timestamp: Date.now(),
                }),
              })
              .promise();
          } catch (e) {
            console.log("couldn't send harvest cancellation message to " + targetConnectionId, e);
          }
        }
      } catch (e) {
        console.error("Error cancelling harvest:", e);
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

          // Check if player can benefit from healing
          if (currentHealth >= MAX_HEALTH) {
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
          const usersParams = {
            TableName: DB,
            KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
            ExpressionAttributeValues: {
              ":pk": bodyAsJSON.chatRoomId,
              ":sk": "CONNECTION#",
            },
          };
          const getConnections = await dynamodb.query(usersParams).promise();

          // Broadcast health update to other players
          for (const connection of getConnections.Items) {
            const targetConnectionId = connection.SK.split("#")[1];
            if (targetConnectionId !== connectionId) {
              try {
                await apig
                  .postToConnection({
                    ConnectionId: targetConnectionId,
                    Data: JSON.stringify({
                      playerHealthUpdate: true,
                      playerId: connectionId,
                      newHealth: newHealth,
                      timestamp: Date.now(),
                    }),
                  })
                  .promise();
              } catch (e) {
                console.log("couldn't send health update to " + targetConnectionId, e);
              }
            }
          }
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

        // Broadcast ground item creation to all players
        const usersParams = {
          TableName: DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": "CONNECTION#",
          },
        };

        const getConnections = await dynamodb.query(usersParams).promise();

        for (const connection of getConnections.Items) {
          const targetConnectionId = connection.SK.split("#")[1];
          try {
            await apig.postToConnection({
              ConnectionId: targetConnectionId,
              Data: JSON.stringify({
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
              }),
            }).promise();
          } catch (e) {
            console.log(`Couldn't send ground item creation to ${targetConnectionId}:`, e);
          }
        }

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

        // Broadcast ground item removal to all players
        const usersParams = {
          TableName: DB,
          KeyConditionExpression: "PK = :pk and begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": bodyAsJSON.chatRoomId,
            ":sk": "CONNECTION#",
          },
        };

        const getConnections = await dynamodb.query(usersParams).promise();

        for (const connection of getConnections.Items) {
          const targetConnectionId = connection.SK.split("#")[1];
          try {
            await apig.postToConnection({
              ConnectionId: targetConnectionId,
              Data: JSON.stringify({
                type: "groundItemRemoved",
                groundItemId,
                pickedUpBy: connectionId,
                timestamp: Date.now(),
              }),
            }).promise();
          } catch (e) {
            console.log(`Couldn't send ground item removal to ${targetConnectionId}:`, e);
          }
        }

        console.log(`Player ${connectionId} picked up ${groundItem.quantity} ${groundItem.itemSubType}`);

      } catch (e) {
        console.error("Error picking up item:", e);
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
