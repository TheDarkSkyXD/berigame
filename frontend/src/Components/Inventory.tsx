import React, { memo, useEffect, useState, useRef } from "react";
import { useChatStore, useInventoryStore, useUserInputStore, useUserStateStore, useWebsocketStore } from "../store";
import { webSocketDropItem, webSocketMoveInventoryItem } from "../Api";

type InventoryProps = {
  setShowInventory: React.Dispatch<React.SetStateAction<boolean>>;
  showInventory: boolean;
};

const Inventory = memo((props: InventoryProps) => {
  const [showInventory, setShowInventory] = useState(false);
  const mouseDownTimeRef = useRef<number | null>(null);
  const dragStartSlotRef = useRef<number | null>(null);

  const focusedChat = useChatStore((state) => state.focusedChat);
  const items = useInventoryStore((state) => state.items);
  const draggedItem = useInventoryStore((state) => state.draggedItem);
  const draggedFromSlot = useInventoryStore((state) => state.draggedFromSlot);
  const dragOverSlot = useInventoryStore((state) => state.dragOverSlot);
  const moveItem = useInventoryStore((state) => state.moveItem);
  const setDraggedItem = useInventoryStore((state) => state.setDraggedItem);
  const setDragOverSlot = useInventoryStore((state) => state.setDragOverSlot);
  const clearDragState = useInventoryStore((state) => state.clearDragState);

  const setClickedOtherObject = useUserInputStore((state: any) => state.setClickedOtherObject);
  const playerPosition = useUserStateStore((state: any) => state.position);
  const websocketConnection = useWebsocketStore((state: any) => state.websocketConnection);
  const health = useUserStateStore((state) => state.health);
  const maxHealth = useUserStateStore((state) => state.maxHealth);

  // Constants for drag detection
  const DRAG_THRESHOLD_MS = 200; // Hold for 200ms to start drag


  const keyDownHandler = (e) => {
    if (e.keyCode === 73 && !focusedChat) {
      setShowInventory(!showInventory);
    }
  };

  const consumeBerry = (item) => {
    if (!item || item.type !== 'berry') return;

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

  // Smart click/drag detection handlers
  const handleMouseDown = (e: React.MouseEvent, item: any, slotIndex: number) => {
    if (!item) return;

    mouseDownTimeRef.current = Date.now();
    dragStartSlotRef.current = slotIndex;
    console.log('Mouse down on slot', slotIndex, 'at time', mouseDownTimeRef.current);
  };

  const handleClick = (e: React.MouseEvent, item: any, slotIndex: number) => {
    if (!item || !mouseDownTimeRef.current) return;

    const clickDuration = Date.now() - mouseDownTimeRef.current;
    console.log('Click detected, duration:', clickDuration, 'ms');

    if (clickDuration < DRAG_THRESHOLD_MS) {
      console.log('Quick click detected for', item.name);
      e.stopPropagation();

      if (item.type === 'berry') {
        consumeBerry(item);
      } else {
        handleItemClick(item, e);
      }
    }

    // Reset
    mouseDownTimeRef.current = null;
    dragStartSlotRef.current = null;
  };
  const handleItemClick = (item: any, e: React.MouseEvent) => {
    if (!item || !websocketConnection) return;

    e.stopPropagation();

    const useItem = () => {
      // TODO: Implement item usage logic
      console.log(`Using ${item.name}`);
      setClickedOtherObject(null);
    };

    const dropItem = () => {
      // Calculate drop position slightly in front of player
      const dropPosition = {
        x: (playerPosition?.x || 0) + (Math.random() - 0.5) * 2,
        y: playerPosition?.y || 0,
        z: (playerPosition?.z || 0) + (Math.random() - 0.5) * 2,
      };

      webSocketDropItem(item.type, item.subType, 1, dropPosition, websocketConnection);
      setClickedOtherObject(null);
    };

    setClickedOtherObject({
      isCombatable: false,
      connectionId: "INVENTORY_ITEM",
      e,
      dropdownOptions: [
        {
          label: `Use ${item.name}`,
          onClick: useItem,
          disabled: true, // Disabled for now until we implement item usage
        },
        {
          label: `Drop ${item.name}`,
          onClick: dropItem,
          disabled: false,
        },
      ],
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e, item, slotIndex) => {
    console.log('Drag start attempted for slot', slotIndex);

    // Check if enough time has passed since mouse down
    if (!mouseDownTimeRef.current) {
      console.log('Preventing drag - no mouse down time recorded');
      e.preventDefault();
      return false;
    }

    const holdDuration = Date.now() - mouseDownTimeRef.current;
    console.log('Hold duration:', holdDuration, 'ms');

    if (holdDuration < DRAG_THRESHOLD_MS) {
      console.log('Preventing drag - not held long enough');
      e.preventDefault();
      return false;
    }

    console.log('Drag start allowed for', item.name);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
    setDraggedItem(item, slotIndex);
  };

  const handleDragEnd = (e) => {
    console.log('Drag ended');
    clearDragState();
    mouseDownTimeRef.current = null;
    dragStartSlotRef.current = null;
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
                  draggable={!!item} // Always draggable if item exists, but controlled by handleDragStart
                  onMouseDown={(e) => item && handleMouseDown(e, item, i)}
                  onClick={(e) => item && handleClick(e, item, i)}
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
                    cursor: item
                      ? (isDragging ? "grabbing" : (item.type === 'berry' ? "pointer" : "grab"))
                      : "default",
                    opacity: isDragging ? 0.5 : 1,
                    transition: "all 0.2s ease",
                    userSelect: "none", // Prevent text selection during drag detection
                  }}
                  title={item ? `${item.name} (${item.quantity || 1})${item.type === 'berry' ? ' - Click to eat, Hold to drag' : ' - Hold to drag'}` : "Empty slot"}
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
