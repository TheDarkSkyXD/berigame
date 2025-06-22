import React, { useEffect } from "react";
import {
  useChatStore,
  useOtherUsersStore,
  useUserStateStore,
  useWebsocketStore,
  useHarvestStore,
  useInventoryStore,
  useGroundItemsStore,
} from "../store";
import { connectToChatRoom } from "../Api";

const Api = (props) => {
  let url = "https://dm465kqzfi.execute-api.ap-southeast-2.amazonaws.com/dev/";
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
  const removeGroundItem = useGroundItemsStore((state: any) => state.removeGroundItem);
  const clearGroundItems = useGroundItemsStore((state: any) => state.clearGroundItems);
  const syncGroundItems = useGroundItemsStore((state: any) => state.syncGroundItems);

  if (process.env.NODE_ENV === "development") {
    url = "http://localhost:3000/dev/";
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
        if (messageObject.attackingPlayer)
          addDamageToRender(messageObject.damageGiven);
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
        const berryConfigs = {
          blueberry: { name: 'Blueberry', icon: '/blueberry.svg' },
          strawberry: { name: 'Strawberry', icon: '/strawberry.svg' },
          greenberry: { name: 'Greenberry', icon: '/greenberry.svg' },
          goldberry: { name: 'Goldberry', icon: '/goldberry.svg' },
        };

        // Clear existing inventory and sync with backend state
        const { items } = useInventoryStore.getState();
        items.forEach(item => {
          if (item.id) {
            removeItem(item.id);
          }
        });

        // Add berries from backend inventory
        Object.keys(berryConfigs).forEach(berryType => {
          const count = inventory[`berries_${berryType}`] || 0;
          if (count > 0) {
            const config = berryConfigs[berryType];
            addItem({
              type: "berry",
              subType: berryType,
              name: config.name,
              icon: config.icon,
              quantity: count,
            });
          }
        });

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

        // Sync inventory
        const berryConfigs = {
          blueberry: { name: 'Blueberry', icon: '/blueberry.svg' },
          strawberry: { name: 'Strawberry', icon: '/strawberry.svg' },
          greenberry: { name: 'Greenberry', icon: '/greenberry.svg' },
          goldberry: { name: 'Goldberry', icon: '/goldberry.svg' },
        };

        // Clear and rebuild inventory
        clearInventory();
        Object.keys(berryConfigs).forEach(berryType => {
          const count = gameState.inventory[`berries_${berryType}`] || 0;
          if (count > 0) {
            const config = berryConfigs[berryType];
            addItem({
              type: "berry",
              subType: berryType,
              name: config.name,
              icon: config.icon,
              quantity: count,
            });
          }
        });

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
          console.log(`Syncing health: ${currentHealth} -> ${gameState.health}`);
          setHealth(gameState.health);
        }

        markValidated();
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
          setHealth(messageObject.health);
          console.log("Current player is respawning");

          // Reset respawning flag after a short delay
          setTimeout(() => {
            setIsRespawning(false);
          }, 1000);
        } else {
          // Update health for other players when they respawn
          setPlayerHealth(messageObject.playerId, messageObject.health);
          console.log(
            `Other player ${messageObject.playerId} respawned with health ${messageObject.health}`
          );
        }
      }

      // Handle berry consumption confirmation
      if (messageObject.berryConsumed) {
        console.log(`Berry consumed: ${messageObject.berryType}, health restored: ${messageObject.healthRestored}`);
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

      // Handle other player health updates
      if (messageObject.playerHealthUpdate) {
        console.log(`Player ${messageObject.playerId} health updated to ${messageObject.newHealth}`);
        setPlayerHealth(messageObject.playerId, messageObject.newHealth);
      }
      // Handle ground item events
      if (messageObject.type === "groundItemCreated") {
        console.log("Ground item created:", messageObject.groundItem);
        addGroundItem(messageObject.groundItem);
      }

      if (messageObject.type === "groundItemRemoved") {
        console.log("Ground item removed:", messageObject.groundItemId);
        removeGroundItem(messageObject.groundItemId);
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

    // Attempt to reconnect after 3 seconds
    setTimeout(() => {
      console.log("Attempting to reconnect WebSocket...");
      initializeWebSocket();
    }, 3000);
  };

  const _webSocketOpen = (e: Event) => {
    console.log("WebSocket connected successfully:", e);
    // Connect to chat room once connection is established
    setTimeout(() => {
      connectToChatRoom("", websocketConnection);

      // Request inventory sync after reconnection
      setTimeout(() => {
        if (websocketConnection && websocketConnection.readyState === WebSocket.OPEN) {
          const payload = {
            chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
            action: "requestInventorySync",
          };
          websocketConnection.send(JSON.stringify(payload));
        }
      }, 2000);
    }, 1000);
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
