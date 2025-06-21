import React, { useRef, useEffect, useState, useMemo } from "react";
import { useUserInputStore, useUserStateStore, useHarvestStore, useWebsocketStore, useLoadingStore } from "../../store";
import { webSocketStartHarvest } from "../../Api";
import { Html, useGLTF } from "@react-three/drei";

// Berry type configurations
const BERRY_TYPES = {
  blueberry: { color: '#4F46E5', name: 'Blueberry', icon: '/blueberry.svg' },
  strawberry: { color: '#EF4444', name: 'Strawberry', icon: '/strawberry.svg' },
  greenberry: { color: '#22C55E', name: 'Greenberry', icon: '/greenberry.svg' },
  goldberry: { color: '#F59E0B', name: 'Goldberry', icon: '/goldberry.svg' },
};

const BerryTree = (props) => {
  const objRef = useRef(null);
  const treeId = props.treeId || `tree_${props.position?.join('_') || 'default'}`;
  const berryType = props.berryType || 'blueberry';
  const berryConfig = BERRY_TYPES[berryType];
  const { addLoadedAsset } = useLoadingStore();

  // Load the tree model
  const { scene } = useGLTF("/tree.glb");
  const copiedScene = useMemo(() => scene.clone(), [scene]);

  const setClickedOtherObject = useUserInputStore(
    (state) => state.setClickedOtherObject
  );
  const setUserFollowing = useUserStateStore((state) => state.setUserFollowing);
  const websocketConnection = useWebsocketStore((state) => state.websocketConnection);

  // Harvest store selectors
  const isTreeHarvestable = useHarvestStore((state) => state.isTreeHarvestable(treeId));
  const getHarvestProgress = useHarvestStore((state) => state.getHarvestProgress(treeId));
  const updateTreeCooldown = useHarvestStore((state) => state.updateTreeCooldown);

  const [harvestProgress, setHarvestProgress] = useState(null);

  // Update harvest progress and tree cooldown periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const progress = getHarvestProgress(useHarvestStore.getState());
      setHarvestProgress(progress);
      updateTreeCooldown(treeId);
    }, 100);

    return () => clearInterval(interval);
  }, [treeId, getHarvestProgress, updateTreeCooldown]);

  const startHarvest = () => {
    if (!isTreeHarvestable || !websocketConnection) return;

    // Move player to tree first
    setUserFollowing(objRef);

    // Start harvest after a short delay to allow player to reach tree
    setTimeout(() => {
      webSocketStartHarvest(treeId, websocketConnection, berryType);
    }, 1000);

    setClickedOtherObject(null);
  };

  const onClick = (e) => {
    e.stopPropagation();

    const harvestLabel = isTreeHarvestable ? `Harvest ${berryConfig.name}` : `Harvesting ${berryConfig.name}...`;
    const isDisabled = !isTreeHarvestable;

    setClickedOtherObject({
      ...objRef,
      isCombatable: false,
      connectionId: "TREE",
      e,
      dropdownOptions: [
        {
          label: harvestLabel,
          onClick: isDisabled ? () => {} : startHarvest,
          disabled: isDisabled,
        },
      ],
    });
  };

  // Mark tree model as loaded when component mounts
  useEffect(() => {
    addLoadedAsset("tree.glb");
  }, [addLoadedAsset]);

  return (
    <group>
      <primitive
        ref={objRef}
        object={copiedScene}
        onClick={onClick}
        position={props.position || [5, 0, 0]}
      />

      {harvestProgress && (
        <Html position={[props.position?.[0] || 5, (props.position?.[1] || 0) + 3, props.position?.[2] || 0]}>
          <div className="harvest-progress ui-element" style={{
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            minWidth: '120px'
          }}>
            <div>Harvesting {berryConfig.name}...</div>
            <div style={{
              background: '#333',
              height: '4px',
              borderRadius: '2px',
              margin: '4px 0',
              overflow: 'hidden'
            }}>
              <div style={{
                background: berryConfig.color,
                height: '100%',
                width: `${((harvestProgress as any)?.progress * 100) || 0}%`,
                transition: 'width 0.1s ease'
              }} />
            </div>
            <div>{Math.round(((harvestProgress as any)?.progress * 100) || 0)}%</div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default BerryTree;