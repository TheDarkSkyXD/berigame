import React, { memo, useEffect, useState } from "react";
import { useChatStore, useInventoryStore, useUserInputStore, useUserStateStore, useWebsocketStore } from "../store";
import { webSocketDropItem } from "../Api";

type InventoryProps = {
  setShowInventory: React.Dispatch<React.SetStateAction<boolean>>;
  showInventory: boolean;
};

const Inventory = memo((props: InventoryProps) => {
  const [showInventory, setShowInventory] = useState(false);
  const focusedChat = useChatStore((state) => state.focusedChat);
  const items = useInventoryStore((state) => state.items);
  const setClickedOtherObject = useUserInputStore((state: any) => state.setClickedOtherObject);
  const playerPosition = useUserStateStore((state: any) => state.position);
  const websocketConnection = useWebsocketStore((state: any) => state.websocketConnection);
  const health = useUserStateStore((state) => state.health);
  const maxHealth = useUserStateStore((state) => state.maxHealth);


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
              return (
                <div
                  key={i}
                  style={{
                    width: "40px",
                    height: "40px",
                    border: "1px solid #555",
                    borderRadius: "4px",
                    background: item ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    cursor: item ? "pointer" : "default",
                  }}
                  title={item ? `${item.name} (${item.quantity || 1})${item.type === 'berry' ? ' - Click to eat' : ''}` : "Empty slot"}
                  onClick={() => item && item.type === 'berry' && consumeBerry(item)}
                >
                  {item && (
                    <>
                      <img
                        src={item.icon || "/berry.svg"}
                        alt={item.name}
                        style={{
                          width: "24px",
                          height: "24px"
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
                          textAlign: "center"
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
