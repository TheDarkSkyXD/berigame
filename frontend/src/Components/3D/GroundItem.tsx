import React, { useRef, useState } from "react";
import { useUserInputStore, useWebsocketStore, useInventoryStore, useGroundItemsStore } from "../../store";
import { webSocketPickupItem } from "../../Api";
import { Html } from "@react-three/drei";

// Berry type configurations
const BERRY_TYPES = {
  blueberry: { color: '#4F46E5', name: 'Blueberry', icon: '/blueberry.svg' },
  strawberry: { color: '#EF4444', name: 'Strawberry', icon: '/strawberry.svg' },
  greenberry: { color: '#22C55E', name: 'Greenberry', icon: '/greenberry.svg' },
  goldberry: { color: '#F59E0B', name: 'Goldberry', icon: '/goldberry.svg' },
};

interface GroundItemProps {
  groundItem: {
    id: string;
    itemType: string;
    itemSubType: string;
    quantity: number;
    position: { x: number; y: number; z: number };
    droppedBy: string;
    droppedAt: number;
    droppedOnDeath?: boolean;
  };
}

const GroundItem: React.FC<GroundItemProps> = ({ groundItem }) => {
  const objRef = useRef<any>();
  const [isHovered, setIsHovered] = useState(false);
  const setClickedOtherObject = useUserInputStore((state: any) => state.setClickedOtherObject);
  const websocketConnection = useWebsocketStore((state: any) => state.websocketConnection);
  const addItem = useInventoryStore((state: any) => state.addItem);
  const markItemBeingPickedUp = useGroundItemsStore((state: any) => state.markItemBeingPickedUp);

  const berryConfig = BERRY_TYPES[groundItem.itemSubType as keyof typeof BERRY_TYPES] || BERRY_TYPES.blueberry;

  const pickupItem = () => {
    if (!websocketConnection) return;

    console.log(`Starting pickup for item ${groundItem.id}`);

    // Optimistically add item to inventory for immediate feedback
    const inventoryItem = {
      type: 'berry',
      subType: groundItem.itemSubType,
      name: berryConfig.name,
      quantity: groundItem.quantity,
      icon: berryConfig.icon || '/berry.svg',
    };

    addItem(inventoryItem);

    // Mark item as being picked up (removes from ground and prevents sync conflicts)
    markItemBeingPickedUp(groundItem.id);

    // Send pickup request to server
    webSocketPickupItem(groundItem.id, websocketConnection);
    setClickedOtherObject(null);
  };

  const onClick = (e: any) => {
    e.stopPropagation();

    setClickedOtherObject({
      ...objRef,
      isCombatable: false,
      connectionId: "GROUND_ITEM",
      e,
      dropdownOptions: [
        {
          label: `Pick up ${groundItem.quantity}x ${berryConfig.name}`,
          onClick: pickupItem,
          disabled: false,
        },
      ],
    });
  };

  return (
    <group
      ref={objRef}
      position={[groundItem.position.x, groundItem.position.y + 0.1, groundItem.position.z]}
      onClick={onClick}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {/* Ground item visual representation */}
      <mesh>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial
          color={berryConfig.color}
          emissive={isHovered ? berryConfig.color : '#000000'}
          emissiveIntensity={isHovered ? 0.2 : 0}
        />
      </mesh>
      
      {/* Quantity indicator if more than 1 */}
      {groundItem.quantity > 1 && (
        <Html
          position={[0, 0.3, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              minWidth: '20px',
            }}
          >
            {groundItem.quantity}
          </div>
        </Html>
      )}

      {/* Hover tooltip */}
      {isHovered && (
        <Html
          position={[0, 0.5, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              border: `1px solid ${berryConfig.color}`,
            }}
          >
            {groundItem.quantity}x {berryConfig.name}
            {groundItem.droppedOnDeath && (
              <div style={{ fontSize: '9px', opacity: 0.7 }}>
                💀 Dropped on death
              </div>
            )}
          </div>
        </Html>
      )}

    </group>
  );
};

export default GroundItem;
