import { Vector3 } from 'three';
import { auth } from './Auth'

let url = "https://dm465kqzfi.execute-api.ap-southeast-2.amazonaws.com/dev/"
let wsUrl = "wss://w6et9cl8r6.execute-api.ap-southeast-2.amazonaws.com/dev/"
// if (process.env.NODE_ENV === 'development')  {
//   url = "http://localhost:3000/dev/";
//   wsUrl = "ws://localhost:3001";
// }
const connectedUsers: any = {};
let clientConnectionId = null;
// export const webSocketSaveConnection = async () => {
//   try {
//     const token = await auth.getToken();
//     if (token) {
//       const payload = {
//         token,
//         action: "saveConnection",
//       }
//       webSocketConnection?.send(JSON.stringify(payload));
//     }
//   } catch (e) {
//     console.error("webSocketSaveConnection Error:", e);
//   }
// }

interface PositionMessage {
  // userId: string | number;
  position: string | number;
  rotation: string | number;
  restPosition: string | Vector3;
  isWalking: boolean;
  attackingPlayer?: boolean;
  optimisticTransactionId?: string;
}

interface DeathMessage {
  type: "playerDeath";
  deadPlayerId: string;
  respawnLocation: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
  timestamp: number;
}

interface RespawnMessage {
  type: "playerRespawn";
  playerId: string;
  health: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  timestamp: number;
}

export const webSocketSendUpdate = async (message: PositionMessage, ws: any, allConnections: any[]) => {
  try {
    const payload = {
      message,
      connections: allConnections,
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4", //The one chatroom for MVP
      action: "sendUpdate",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketSendMessage Error:", e);
    setTimeout(() => {
      webSocketSendUpdate(message, ws, allConnections);
    }, 500);
  }
}

// Optimistic attack function that applies damage immediately and sends to server
export const webSocketSendOptimisticAttack = async (
  message: PositionMessage,
  ws: any,
  allConnections: any[],
  applyOptimisticDamage: (attackerId: string, targetId: string, estimatedDamage?: number) => string
) => {
  try {
    // Apply optimistic damage immediately if this is an attack
    let transactionId = null;
    if (message.attackingPlayer) {
      // Estimate damage (average of 0-3 range is 1.5, round to 2)
      const estimatedDamage = 2;
      transactionId = applyOptimisticDamage('self', message.attackingPlayer, estimatedDamage);
      console.log(`⚡ Optimistic attack: ${estimatedDamage} damage to ${message.attackingPlayer} (txn: ${transactionId})`);
    }

    // Add transaction ID to message for server verification
    const enhancedMessage = {
      ...message,
      optimisticTransactionId: transactionId,
    };

    const payload = {
      message: enhancedMessage,
      connections: allConnections,
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "sendUpdate",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketSendOptimisticAttack Error:", e);
    setTimeout(() => {
      webSocketSendOptimisticAttack(message, ws, allConnections, applyOptimisticDamage);
    }, 500);
  }
}

export const webSocketSendMessage = async (message: string, ws: any) => {
  try {
    const payload = {
      message,
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4", //The one chatroom for MVP
      action: "sendMessagePublic",
    }
    ws?.send(JSON.stringify(payload));
    return payload;
  } catch (e) {
    console.error("webSocketSendMessage Error:", e);
  }
}

export const connectToChatRoom = async (chatRoomId: string = "", ws: any) => {
  try {
    const payload = {
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4", //The one chatroom for MVP
      action: "connectToChatRoom",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    // console.log("webSocketSaveConnection Error:", e);
    setTimeout(() => {
      connectToChatRoom(chatRoomId, ws);
    }, 500);
  }
}

export const webSocketStartHarvest = async (treeId: string, ws: any, berryType?: string) => {
  try {
    const payload = {
      treeId,
      berryType: berryType || 'blueberry',
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "startHarvest",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketStartHarvest Error:", e);
  }
}

export const webSocketCompleteHarvest = async (treeId: string, ws: any) => {
  try {
    const payload = {
      treeId,
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "completeHarvest",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketCompleteHarvest Error:", e);
  }
}

export const webSocketValidateInventory = async (ws: any) => {
  try {
    const payload = {
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "validateInventory",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketValidateInventory Error:", e);
  }
}

export const webSocketRequestInventorySync = async (ws: any) => {
  try {
    const payload = {
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "requestInventorySync",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketRequestInventorySync Error:", e);
  }
}

export const webSocketMoveInventoryItem = async (ws: any, fromSlot: number, toSlot: number) => {
  try {
    const payload = {
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "moveInventoryItem",
      fromSlot,
      toSlot,
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketMoveInventoryItem Error:", e);
  }
}

export const webSocketValidateGameState = async (ws: any) => {
  try {
    const payload = {
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "validateGameState",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketValidateGameState Error:", e);
  }
}

export const webSocketDropItem = async (itemType: string, itemSubType: string, quantity: number, ws: any) => {
  try {
    // Map legacy berry types to new item IDs
    const legacyBerryMapping = {
      'blueberry': 'berry_blueberry',
      'strawberry': 'berry_strawberry',
      'greenberry': 'berry_greenberry',
      'goldberry': 'berry_goldberry'
    };

    // Use new itemId format, fallback to subType for backward compatibility
    const itemId = legacyBerryMapping[itemSubType] || itemSubType;

    const payload = {
      itemId,
      quantity,
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "dropItem",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketDropItem Error:", e);
  }
}

export const webSocketPickupItem = async (groundItemId: string, ws: any) => {
  try {
    const payload = {
      groundItemId,
      chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
      action: "pickupItem",
    }
    ws?.send(JSON.stringify(payload));
  } catch (e) {
    console.error("webSocketPickupItem Error:", e);
  }
}

export const deleteUserPosition = (userId: string) => {
  delete connectedUsers[userId];
}

export const getUserPositions = () => {
  return connectedUsers;
}

export const getClientConnectionId = () => {
  return clientConnectionId;
}
