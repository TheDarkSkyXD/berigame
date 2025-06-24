import React, { useEffect } from "react";
import {
  useChatStore,
  useOtherUsersStore,
  useUserStateStore,
  useWebsocketStore,
  useHarvestStore,
  useInventoryStore,
  useGroundItemsStore,
  useLoadingStore,
} from "../store";
import { connectToChatRoom } from "../Api";

const Api = (props) => {
  let wsUrl = "wss://w6et9cl8r6.execute-api.ap-southeast-2.amazonaws.com/dev/";
  const setWebSocket = useWebsocketStore((state: any) => state.setWebSocket);
  const websocketConnection = useWebsocketStore(
    (state: any) => state.websocketConnection
  );
  const setAllConnections = useWebsocketStore(
    (state: any) => state.setAllConnections
  );
  const allConnections = useWebsocketStore(
    (state: any) => state.allConnections
  );
  const addChatMessage = useChatStore((state: any) => state.addChatMessage);
  const setUserPosition = useOtherUsersStore(
    (state: any) => state.setUserPosition
  );
  const addDamageToRender = useOtherUsersStore(
    (state: any) => state.addDamageToRender
  );
  const setPlayerHealth = useOtherUsersStore(
    (state: any) => state.setPlayerHealth
  );
  const setUserConnectionId = useUserStateStore(
    (state: any) => state.setUserConnectionId
  );
  const userConnectionId = useUserStateStore(
    (state: any) => state.userConnectionId
  );

  const startHarvest = useHarvestStore((state: any) => state.startHarvest);
  const completeHarvest = useHarvestStore(
    (state: any) => state.completeHarvest
  );
  const cancelHarvest = useHarvestStore((state: any) => state.cancelHarvest);
  const addItem = useInventoryStore((state: any) => state.addItem);
  const removeItem = useInventoryStore((state: any) => state.removeItem);
  const clearInventory = useInventoryStore((state: any) => state.clearInventory);
  const shouldValidate = useInventoryStore((state: any) => state.shouldValidate);
  const markValidated = useInventoryStore((state: any) => state.markValidated);
  const setIsDead = useUserStateStore((state: any) => state.setIsDead);
  const setIsRespawning = useUserStateStore(
    (state: any) => state.setIsRespawning
  );
  const setHealth = useUserStateStore((state: any) => state.setHealth);
  const setPositionCorrection = useUserStateStore((state: any) => state.setPositionCorrection);
  const addGroundItem = useGroundItemsStore((state: any) => state.addGroundItem);
  const addGroundItemAndCleanup = useGroundItemsStore((state: any) => state.addGroundItemAndCleanup);
  const removeGroundItem = useGroundItemsStore((state: any) => state.removeGroundItem);
  const confirmPickupCompleted = useGroundItemsStore((state: any) => state.confirmPickupCompleted);
  const clearGroundItems = useGroundItemsStore((state: any) => state.clearGroundItems);
  const syncGroundItems = useGroundItemsStore((state: any) => state.syncGroundItems);
  const setWebsocketConnected = useLoadingStore((state: any) => state.setWebsocketConnected);
  const setGameDataLoaded = useLoadingStore((state: any) => state.setGameDataLoaded);

  if (process.env.NODE_ENV === "development") {
    wsUrl = "ws://localhost:3001";
  }
  let clientConnectionId = null;

  useEffect(() => {
    if (websocketConnection)
      websocketConnection.onmessage = _webSocketMessageReceived;
  }, [allConnections]);

  const updateUserPosition = (newData: any) => {
    newData.selfDestroyTime = new Date().getTime() + 5000;
    setUserPosition(newData);
    if (allConnections && allConnections.indexOf(newData.connectionId) === -1) {
      setAllConnections([...allConnections, newData.connectionId]);
    }
  };

  const handlePositionCorrection = (correctionData: any) => {
    console.log("Server corrected position:", correctionData);

    // Store the correction data for the PlayerController to handle
    setPositionCorrection({
      correctedPosition: correctionData.correctedPosition,
      reason: correctionData.reason,
      timestamp: correctionData.timestamp
    });

    // Show user feedback (optional - could be removed to not reveal anti-cheat)
    if (correctionData.reason === "boundary_violation") {
      console.warn("Movement was outside game boundaries");
    } else if (correctionData.reason === "speed_violation") {
      console.warn("Movement was too fast");
    } else if (correctionData.reason === "teleportation_detected") {
      console.warn("Invalid movement detected");
    }
  };

  const updateConnections = (connections: any) => {
    const tempAllConnections = [];
    for (const item of connections) {
      tempAllConnections.push(item.SK.split("#")[1]);
    }
    setAllConnections(tempAllConnections);
  };

  const _webSocketMessageReceived = (e) => {
    if (e.data) {
      const messageObject = JSON.parse(e.data);

      if (messageObject.chatMessage) {
        addChatMessage(messageObject);
      }

      // Handle position corrections from server
      if (messageObject.type === "positionCorrection") {
        console.warn("Position corrected by server:", messageObject.reason);
        handlePositionCorrection(messageObject);
        return;
      }

      if (messageObject.position && messageObject.userId) {
        updateUserPosition(messageObject);
        if (messageObject.attackingPlayer && messageObject.damageGiven) {
          // Process damage to show on the target player
          // Everyone should see damage numbers on the target (including the target themselves)
          addDamageToRender(messageObject.damageGiven);

          // Handle consolidated health update if included in attack message
          if (messageObject.damageGiven.newHealth !== undefined) {
            const targetPlayerId = messageObject.damageGiven.receivingPlayer;
            if (targetPlayerId === userConnectionId) {
              // Update own health from consolidated attack message
              console.log(`❤️ Attack damage - Own player health: ${useUserStateStore.getState().health} -> ${messageObject.damageGiven.newHealth}`);
              setHealth(messageObject.damageGiven.newHealth);
            } else {
              // Update other player's health from consolidated attack message
              console.log(`❤️ Attack damage - Other player ${targetPlayerId} health: ${messageObject.damageGiven.newHealth}`);
              setPlayerHealth(targetPlayerId, messageObject.damageGiven.newHealth);
            }
          }
        }
      }

      if (messageObject.connections) {
        updateConnections(messageObject.connections);
        console.log("MY CID: ", messageObject.yourConnectionId);
        setUserConnectionId(messageObject.yourConnectionId);
      }
      // Handle harvest-related messages
      if (messageObject.harvestStarted) {
        startHarvest(
          messageObject.treeId,
          messageObject.playerId,
          messageObject.duration
        );
      }
      if (messageObject.harvestCompleted) {
        completeHarvest(messageObject.treeId);
        if (messageObject.playerId === userConnectionId) {
          // Add berry to inventory for the harvesting player
          const berryType = messageObject.berryType || 'blueberry';
          const berryConfigs = {
            blueberry: { name: 'Blueberry', icon: '/blueberry.svg' },
            strawberry: { name: 'Strawberry', icon: '/strawberry.svg' },
            greenberry: { name: 'Greenberry', icon: '/greenberry.svg' },
            goldberry: { name: 'Goldberry', icon: '/goldberry.svg' },
          };
          const config = berryConfigs[berryType] || berryConfigs.blueberry;

          addItem({
            type: "berry",
            subType: berryType,
            name: config.name,
            icon: config.icon,
            quantity: 1,
          });
        }
      }

      // Handle inventory synchronization from backend
      if (messageObject.inventorySync || messageObject.inventoryValidation) {
        const inventory = messageObject.inventory;

        // Use new setInventory method for clean sync
        const { setInventory } = useInventoryStore.getState();
        setInventory(inventory);

        const messageType = messageObject.inventoryValidation ? 'validated' : 'synchronized';
        console.log(`Inventory ${messageType} with backend:`, inventory);

        // Mark inventory as validated
        markValidated();
      }

      // Handle harvest cancellation
      if (messageObject.harvestCancelled) {
        cancelHarvest(messageObject.treeId);
        console.log(`Harvest cancelled for tree ${messageObject.treeId} by player ${messageObject.playerId}`);
      }

      // Handle comprehensive game state validation
      if (messageObject.gameStateValidation) {
        const gameState = messageObject.gameState;
        console.log('Received game state validation:', gameState);

        // Sync inventory using new system
        const { setInventory } = useInventoryStore.getState();
        setInventory(gameState.inventory);

        // Sync harvest states
        const { activeHarvests, cancelHarvest, startHarvest } = useHarvestStore.getState();

        // Cancel harvests that don't exist on server
        Object.keys(activeHarvests).forEach(treeId => {
          const serverHasHarvest = gameState.activeHarvests.some(h => h.treeId === treeId);
          if (!serverHasHarvest) {
            console.log(`Cancelling client-side harvest for tree ${treeId} - not found on server`);
            cancelHarvest(treeId);
          }
        });

        // Start harvests that exist on server but not client
        gameState.activeHarvests.forEach(serverHarvest => {
          if (!activeHarvests[serverHarvest.treeId]) {
            const elapsedTime = Date.now() - serverHarvest.startTime;
            const remainingTime = Math.max(0, serverHarvest.duration - elapsedTime / 1000);
            if (remainingTime > 0) {
              console.log(`Starting client-side harvest for tree ${serverHarvest.treeId} - found on server`);
              startHarvest(serverHarvest.treeId, serverHarvest.playerId, remainingTime);
            }
          }
        });

        // Sync ground items
        if (gameState.groundItems) {
          console.log(`Syncing ${gameState.groundItems.length} ground items`);
          syncGroundItems(gameState.groundItems);
        }

        // Update health if different
        const currentHealth = useUserStateStore.getState().health;
        if (currentHealth !== gameState.health) {
          console.log(`❤️ Backend sync - Own player health: ${currentHealth} -> ${gameState.health}`);
          setHealth(gameState.health);
        }

        markValidated();

        // Notify loading store that game data is loaded
        setGameDataLoaded(true);

        console.log('Game state synchronized with backend');
      }

      // Handle death event
      if (messageObject.type === "playerDeath") {
        console.log("Player death event received:", messageObject);
        if (messageObject.deadPlayerId === userConnectionId) {
          setIsDead(true);
          console.log("Current player has died");
        }
      }

      // Handle respawn event
      if (messageObject.type === "playerRespawn") {
        console.log("Player respawn event received:", messageObject);
        if (messageObject.playerId === userConnectionId) {
          setIsDead(false);
          setIsRespawning(true);
          console.log(`❤️ Respawn - Own player health restored to: ${messageObject.health}`);
          setHealth(messageObject.health);
          console.log("Current player is respawning");

          // Reset respawning flag after a short delay
          setTimeout(() => {
            setIsRespawning(false);
          }, 1000);
        } else {
          // Update health for other players when they respawn
          console.log(`❤️ Respawn - Other player ${messageObject.playerId} health restored to: ${messageObject.health}`);
          setPlayerHealth(messageObject.playerId, messageObject.health);
          console.log(
            `Other player ${messageObject.playerId} respawned with health ${messageObject.health}`
          );
        }
      }

      // Handle berry consumption confirmation
      if (messageObject.berryConsumed) {
        console.log(`Berry consumed: ${messageObject.berryType}, health restored: ${messageObject.healthRestored}`);
        console.log(`❤️ Berry consumption - Own player health: ${useUserStateStore.getState().health} -> ${messageObject.newHealth}`);
        setHealth(messageObject.newHealth);

        // Update inventory by requesting sync
        if (websocketConnection && websocketConnection.readyState === WebSocket.OPEN) {
          const payload = {
            chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
            action: "requestInventorySync",
          };
          websocketConnection.send(JSON.stringify(payload));
        }
      }

      // Handle inventory move acknowledgment
      if (messageObject.inventoryMoveAck) {
        console.log(`Inventory move acknowledged: slot ${messageObject.fromSlot} -> slot ${messageObject.toSlot}`);
        // The move was already applied locally for responsive UI
        // This acknowledgment confirms the backend processed it successfully
      }

      // Handle non-attack health updates (e.g., berry consumption, respawn)
      // Note: Attack damage health updates are now consolidated in the attack message above
      if (messageObject.playerHealthUpdate) {
        // Update health for all players (including self for consistency)
        if (messageObject.playerId === userConnectionId) {
          // Update own health from backend
          console.log(`❤️ Backend update - Own player health: ${messageObject.newHealth}`);
          setHealth(messageObject.newHealth);
        } else {
          // Update other player's health
          console.log(`❤️ Backend update - Other player ${messageObject.playerId} health: ${messageObject.newHealth}`);
          setPlayerHealth(messageObject.playerId, messageObject.newHealth);
        }
      }
      // Handle ground item events
      if (messageObject.type === "groundItemCreated") {
        addGroundItemAndCleanup(messageObject.groundItem);
      }

      if (messageObject.type === "groundItemRemoved") {
        // Always remove the ground item from the list
        removeGroundItem(messageObject.groundItemId);

        // If this player picked up the item, confirm the pickup and sync inventory
        if (messageObject.pickedUpBy === userConnectionId) {
          console.log(`Pickup confirmed for item ${messageObject.groundItemId}, syncing inventory`);

          // Confirm pickup completed (removes from pending list)
          confirmPickupCompleted(messageObject.groundItemId);

          // Request inventory sync to update local inventory
          if (websocketConnection && websocketConnection.readyState === WebSocket.OPEN) {
            const payload = {
              chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
              action: "requestInventorySync",
            };
            websocketConnection.send(JSON.stringify(payload));
          }
        } else {
          // For other players' pickups, just confirm completion to clean up any pending state
          confirmPickupCompleted(messageObject.groundItemId);
        }
      }
    }
  };

  const _webSocketError = (e: Event) => {
    console.error("Websocket error:", e);
    console.error("WebSocket URL:", wsUrl);
    console.error("Error details:", {
      type: e.type,
      target: e.target,
      timeStamp: e.timeStamp
    });

    // Notify loading store that websocket is disconnected
    setWebsocketConnected(false);
    setGameDataLoaded(false);

    // Clear inventory on connection error to prevent stale state
    clearInventory();

    // Clear ground items on connection error
    clearGroundItems();

    // Cancel any active harvests on error
    const { activeHarvests, cancelHarvest } = useHarvestStore.getState();
    Object.keys(activeHarvests).forEach(treeId => {
      cancelHarvest(treeId);
    });
  };

  const _webSocketClose = (e: CloseEvent) => {
    console.log("Websocket close:", e);
    console.log("Close details:", {
      code: e.code,
      reason: e.reason,
      wasClean: e.wasClean
    });

    // Notify loading store that websocket is disconnected
    setWebsocketConnected(false);
    setGameDataLoaded(false);

    // Attempt to reconnect after 3 seconds
    setTimeout(() => {
      console.log("Attempting to reconnect WebSocket...");
      initializeWebSocket();
    }, 3000);
  };

  const _webSocketOpen = (e: Event) => {
    console.log("WebSocket connected successfully:", e);
    const ws = e.target as WebSocket; // Get the actual WebSocket instance

    // Notify loading store that websocket is connected
    setWebsocketConnected(true);

    // Connect to chat room once connection is established
    setTimeout(() => {
      connectToChatRoom("", ws);

      // Immediately request game state validation for faster loading
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          console.log("🚀 Requesting immediate game state validation for faster loading");
          const gameStatePayload = {
            chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
            action: "validateGameState",
          };
          ws.send(JSON.stringify(gameStatePayload));

          // Also request inventory sync
          const inventoryPayload = {
            chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
            action: "requestInventorySync",
          };
          ws.send(JSON.stringify(inventoryPayload));
        }
      }, 100);
    }, 500); // Reduced to 500ms for faster connection
  };

  const initializeWebSocket = () => {
    try {
      console.log("Initializing WebSocket connection to:", wsUrl);
      const webSocketConnection = new WebSocket(wsUrl);

      webSocketConnection.onopen = _webSocketOpen;
      webSocketConnection.onerror = _webSocketError;
      webSocketConnection.onclose = _webSocketClose;
      webSocketConnection.onmessage = _webSocketMessageReceived;

      setWebSocket(webSocketConnection);
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
    }
  };

  //Initialize Websocket
  useEffect(() => {
    initializeWebSocket();
  }, []);

  // Periodic game state validation
  useEffect(() => {
    const validationInterval = setInterval(() => {
      if (websocketConnection && websocketConnection.readyState === WebSocket.OPEN && shouldValidate()) {
        const payload = {
          chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
          action: "validateGameState",
        };
        websocketConnection.send(JSON.stringify(payload));
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(validationInterval);
  }, [websocketConnection, shouldValidate]);

  return <div> </div>;
};

export default Api;
