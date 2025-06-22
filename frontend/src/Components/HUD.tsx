import React, { useEffect, useRef, useState } from 'react';
import { useHUDStore, useUserStateStore, useWebsocketStore, useInventoryStore, useChatStore } from '../store';
import QuickUseSlot from './QuickUseSlot';

const HUD: React.FC = () => {
  const hudRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Store states
  const { 
    isVisible, 
    position, 
    quickUseSlots, 
    setPosition, 
    setQuickUseSlot, 
    clearQuickUseSlot, 
    toggleVisibility,
    initializePosition 
  } = useHUDStore();
  
  const health = useUserStateStore((state) => state.health);
  const maxHealth = useUserStateStore((state) => state.maxHealth);
  const websocketConnection = useWebsocketStore((state) => state.websocketConnection);
  const items = useInventoryStore((state) => state.items);
  const focusedChat = useChatStore((state) => state.focusedChat);

  // Initialize position from localStorage on mount
  useEffect(() => {
    initializePosition();
  }, [initializePosition]);

  // Sync quick-use slots with inventory changes
  useEffect(() => {
    // Check if any quick-use slot items no longer exist in inventory
    quickUseSlots.forEach((slotItem, index) => {
      if (slotItem) {
        const stillExists = items.find(invItem =>
          invItem.id === slotItem.id &&
          invItem.type === slotItem.type &&
          invItem.subType === slotItem.subType
        );

        if (!stillExists) {
          clearQuickUseSlot(index);
        } else if (stillExists.quantity !== slotItem.quantity) {
          // Update quantity if it changed
          setQuickUseSlot(index, stillExists);
        }
      }
    });
  }, [items, quickUseSlots, clearQuickUseSlot, setQuickUseSlot]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (focusedChat) return; // Don't handle shortcuts when chat is focused

      // Toggle HUD visibility with 'H'
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        toggleVisibility();
        return;
      }

      // Quick use slots with number keys 1, 2, 3
      if (e.key >= '1' && e.key <= '3') {
        e.preventDefault();
        const slotIndex = parseInt(e.key) - 1;
        const item = quickUseSlots[slotIndex];
        if (item && item.type === 'berry') {
          consumeBerry(item);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleVisibility, focusedChat, quickUseSlots]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === hudRef.current || (e.target as HTMLElement).classList.contains('hud-header')) {
      setIsDragging(true);
      const rect = hudRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  // Berry consumption logic (reused from Inventory component)
  const consumeBerry = (item: any) => {
    if (!item || item.type !== 'berry') return;

    if (health >= maxHealth) {
      console.log("Health is already full, cannot consume berry");
      return;
    }

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

  // Handle item drop on quick-use slot
  const handleSlotDrop = (slotIndex: number, item: any) => {
    // Check if item exists in inventory
    const inventoryItem = items.find(invItem => 
      invItem.type === item.type && 
      invItem.subType === item.subType &&
      invItem.id === item.id
    );
    
    if (inventoryItem) {
      setQuickUseSlot(slotIndex, inventoryItem);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (!isVisible) {
    return (
      <button
        className="hud-toggle-button"
        onClick={toggleVisibility}
        style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          border: '1px solid #555',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
        title="Show HUD (H)"
      >
        Show HUD
      </button>
    );
  }

  const healthPercentage = (health / maxHealth) * 100;

  return (
    <div
      ref={hudRef}
      className="hud-container"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.8)',
        border: '2px solid #444',
        borderRadius: '8px',
        padding: '12px',
        minWidth: '200px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        pointerEvents: 'all'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with close button */}
      <div 
        className="hud-header" 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold'
        }}
      >
        <span>HUD</span>
        <button
          onClick={toggleVisibility}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px 6px'
          }}
          title="Hide HUD (H)"
        >
          ×
        </button>
      </div>

      {/* Health Bar */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          color: 'white',
          fontSize: '11px',
          marginBottom: '4px'
        }}>
          Health: {health}/{maxHealth}
        </div>
        <div style={{
          width: '100%',
          height: '16px',
          background: '#333',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid #555'
        }}>
          <div style={{
            width: `${healthPercentage}%`,
            height: '100%',
            background: healthPercentage > 60 ? '#4CAF50' : healthPercentage > 30 ? '#FF9800' : '#F44336',
            transition: 'width 0.3s ease, background-color 0.3s ease'
          }} />
        </div>
      </div>

      {/* Quick Use Slots */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          color: 'white',
          fontSize: '11px',
          marginBottom: '6px'
        }}>
          Quick Use:
        </div>
        <div style={{
          display: 'flex',
          gap: '6px'
        }}>
          {quickUseSlots.map((item, index) => (
            <QuickUseSlot
              key={index}
              item={item}
              slotIndex={index}
              onItemUse={consumeBerry}
              onDrop={handleSlotDrop}
              onDragOver={handleDragOver}
            />
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        color: '#aaa',
        fontSize: '9px',
        textAlign: 'center',
        marginTop: '4px'
      }}>
        Drag berries here • 1,2,3 to use • H to toggle
      </div>
    </div>
  );
};

export default HUD;
