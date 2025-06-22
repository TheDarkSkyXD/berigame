import React, { memo, useEffect, useState } from "react";
import { useChatStore, useInventoryStore, useUserStateStore, useWebsocketStore } from "../store";
import { webSocketMoveInventoryItem } from "../Api";

type InventoryProps = {
  setShowInventory: React.Dispatch<React.SetStateAction<boolean>>;
  showInventory: boolean;
};

const Inventory = memo((props: InventoryProps) => {
  const [showInventory, setShowInventory] = useState(false);
  const focusedChat = useChatStore((state) => state.focusedChat);
  const items = useInventoryStore((state) => state.items);
  const draggedItem = useInventoryStore((state) => state.draggedItem);
  const draggedFromSlot = useInventoryStore((state) => state.draggedFromSlot);
  const dragOverSlot = useInventoryStore((state) => state.dragOverSlot);
  const moveItem = useInventoryStore((state) => state.moveItem);
  const setDraggedItem = useInventoryStore((state) => state.setDraggedItem);
  const setDragOverSlot = useInventoryStore((state) => state.setDragOverSlot);
  const clearDragState = useInventoryStore((state) => state.clearDragState);

  const health = useUserStateStore((state) => state.health);
  const maxHealth = useUserStateStore((state) => state.maxHealth);
  const websocketConnection = useWebsocketStore((state) => state.websocketConnection);


  const keyDownHandler = (e) => {
    if (e.keyCode === 73 && !focusedChat) {
      setShowInventory(!showInventory);
    }
  };

  const consumeBerry = (item) => {
    if (!item || item.type !== 'berry') return;

    // Check if player can benefit from healing
    if (health >= maxHealth) {
      console.log("Health is already full, cannot consume berry");
      return;
    }

    // Send consumption request to backend
    if (websocketConnection && websocketConnection.readyState === WebSocket.OPEN) {
      const payload = {
        action: "consumeBerry",
        chatRoomId: "CHATROOM#913a9780-ff43-11eb-aa45-277d189232f4",
        berryType: item.subType,
        itemId: item.id
      };
      websocketConnection.send(JSON.stringify(payload));
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, item, slotIndex) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
    setDraggedItem(item, slotIndex);
  };

  const handleDragEnd = (e) => {
    clearDragState();
  };

  const handleDragOver = (e, slotIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(slotIndex);
  };

  const handleDragLeave = (e) => {
    // Only clear drag over if we're leaving the slot entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverSlot(null);
    }
  };

  const handleDrop = (e, toSlot) => {
    e.preventDefault();

    if (draggedFromSlot !== null && draggedFromSlot !== toSlot) {
      // Update local state immediately for responsive UI
      moveItem(draggedFromSlot, toSlot);

      // Send move request to backend
      if (websocketConnection && websocketConnection.readyState === WebSocket.OPEN) {
        webSocketMoveInventoryItem(websocketConnection, draggedFromSlot, toSlot);
      }
    }

    clearDragState();
  };

  useEffect(() => {
    window.addEventListener("keydown", keyDownHandler, false);
    return () => {
      window.removeEventListener("keydown", keyDownHandler);
    };
  }, [showInventory, focusedChat]);

  return (
    <>
      <button className="ui-element"
        onClick={() => {
          setShowInventory(!showInventory);
        }}
      >
        {!showInventory ? "Inventory" : "Close Inventory"}
      </button>
      {showInventory && (
        <div
          className="inventory ui-element"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "repeat(7, 1fr)",
            gap: "10px",
            maxWidth: "300px",
            maxHeight: "400px",
            padding: "10px",
            background: "rgba(0, 0, 0, 0.8)",
            border: "1px solid #333",
            borderRadius: "8px",
            pointerEvents: 'all'
          }}
        >
          {Array(28)
            .fill(0)
            .map((_, i) => {
              const item = items[i];
              const isDragOver = dragOverSlot === i;
              const isDragging = draggedFromSlot === i;

              return (
                <div
                  key={i}
                  draggable={!!item}
                  onDragStart={(e) => item && handleDragStart(e, item, i)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                  style={{
                    width: "40px",
                    height: "40px",
                    border: isDragOver ? "2px solid #4CAF50" : "1px solid #555",
                    borderRadius: "4px",
                    background: isDragOver
                      ? "rgba(76, 175, 80, 0.4)"
                      : item
                        ? "rgba(76, 175, 80, 0.2)"
                        : "rgba(255, 255, 255, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    cursor: item ? (isDragging ? "grabbing" : "grab") : "default",
                    opacity: isDragging ? 0.5 : 1,
                    transition: "all 0.2s ease",
                  }}
                  title={item ? `${item.name} (${item.quantity || 1})${item.type === 'berry' ? ' - Click to eat, Drag to move' : ' - Drag to move'}` : "Empty slot"}
                  onClick={() => item && item.type === 'berry' && !isDragging && consumeBerry(item)}
                >
                  {item && (
                    <>
                      <img
                        src={item.icon || "/berry.svg"}
                        alt={item.name}
                        style={{
                          width: "24px",
                          height: "24px",
                          pointerEvents: "none", // Prevent image from interfering with drag
                        }}
                      />
                      {(item.quantity || 1) > 1 && (
                        <div style={{
                          position: "absolute",
                          bottom: "2px",
                          right: "2px",
                          fontSize: "10px",
                          color: "white",
                          background: "rgba(0, 0, 0, 0.7)",
                          borderRadius: "2px",
                          padding: "1px 3px",
                          minWidth: "12px",
                          textAlign: "center",
                          pointerEvents: "none", // Prevent quantity from interfering with drag
                        }}>
                          {item.quantity || 1}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </>
  );
});

export default Inventory;
