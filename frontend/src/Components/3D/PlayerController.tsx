import React, { Suspense, useState, useEffect, useRef } from "react";
import TWEEN from "@tweenjs/tween.js";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  useChatStore,
  useOtherUsersStore,
  useUserInputStore,
  useUserStateStore,
  useWebsocketStore,
  useLoadingStore,
} from "../../store";
import { webSocketSendUpdate } from "../../Api";
import { RawShaderMaterial, Vector3, cloneUniformsGroups } from "three";
import HealthBar from "./HealthBar";
import ChatBubble from "./ChatBubble";
import DamageNumber from "./DamageNumber";

const PlayerController = (props) => {
  const objRef = useRef(null) as any;
  const { scene: obj, animations } = useGLTF("native-woman.glb") as any;
  const { actions, mixer } = useAnimations(animations, obj);
  const { addLoadedAsset } = useLoadingStore();
  const [currentTween, setCurrentTween] = useState<any>(null);
  const [followingInterval, setFollowingInterval] = useState<any>(null);
  const websocketConnection = useWebsocketStore(
    (state: any) => state.websocketConnection
  );
  const allConnections = useWebsocketStore(
    (state: any) => state.allConnections
  );
  const clickedPointOnLand = useUserInputStore(
    (state: any) => state.clickedPointOnLand
  );
  const clickedOtherObject = useUserInputStore(
    (state: any) => state.clickedOtherObject
  );
  const userFollowing = useUserStateStore((state: any) => state.userFollowing);
  const userAttacking = useUserStateStore((state: any) => state.userAttacking);
  const userConnectionId = useUserStateStore(
    (state: any) => state.userConnectionId
  );
  const isDead = useUserStateStore((state: any) => state.isDead);
  const isRespawning = useUserStateStore((state: any) => state.isRespawning);
  const health = useUserStateStore((state: any) => state.health);
  const setHealth = useUserStateStore((state: any) => state.setHealth);
  const setIsDead = useUserStateStore((state: any) => state.setIsDead);
  const setPosition = useUserStateStore((state: any) => state.setPosition);
  const positionCorrection = useUserStateStore((state: any) => state.positionCorrection);
  const clearPositionCorrection = useUserStateStore((state: any) => state.clearPositionCorrection);
  const justSentMessage = useChatStore((state) => state.justSentMessage);
  const damageToRender = useOtherUsersStore((state) => state.damageToRender);
  const removeDamageToRender = useOtherUsersStore(
    (state) => state.removeDamageToRender
  );

  const [localHealth, setLocalHealth] = useState(30);
  const [isPlayingDeathAnimation, setIsPlayingDeathAnimation] = useState(false);

  const [currentDamage, setCurrentDamage] = useState<any>(null);

  // Spawn location - center of the island
  const SPAWN_LOCATION = { x: 0, y: 0, z: 0 };

  useEffect(() => {
    // Check expired damage number
    if (currentDamage?.timestamp < Date.now() - 1400) setCurrentDamage(null);
  });

  useEffect(() => {
    // Set damage to render variables for own player
    const userDamage = damageToRender[userConnectionId];
    if (userDamage !== null && userDamage !== undefined) {
      // Only set the damage number, let backend health update handle the actual health value
      setCurrentDamage({ val: userDamage, timestamp: Date.now() });
      removeDamageToRender(userConnectionId);
    }
  }, [damageToRender]);

  // Sync local health with global health state (updated by backend)
  useEffect(() => {
    setLocalHealth(health);

    // Check for death when health changes
    if (health <= 0 && !isDead) {
      console.log("Player health reached 0, triggering death state");
      setIsDead(true);
      setIsPlayingDeathAnimation(true);
    }
  }, [health]);

  // Handle death state changes
  useEffect(() => {
    if (isDead && !isPlayingDeathAnimation) {
      setIsPlayingDeathAnimation(true);
      console.log("Playing death animation placeholder");

      // TODO: Replace with actual death animation when available
      // For now, just stop all current animations
      actions["Walk"]?.stop();
      actions["RightHook"]?.stop();
      actions["Idle"]?.stop();

      // Placeholder death animation - could be a fade out or collapse
      console.log("DEATH ANIMATION PLACEHOLDER: Player has died!");
    }
  }, [isDead]);

  // Handle respawn
  useEffect(() => {
    if (isRespawning) {
      console.log("Respawning player to spawn location");
      setIsPlayingDeathAnimation(false);
      setLocalHealth(health);

      // Move player to spawn location
      if (objRef.current) {
        objRef.current.position.set(SPAWN_LOCATION.x, SPAWN_LOCATION.y, SPAWN_LOCATION.z);
        obj.rotation.set(0, 0, 0);

        // Update global position state
        updateGlobalPosition();

        // Restart idle animation
        actions["Idle"]?.play();

        // Broadcast new position to other players
        webSocketSendUpdate(
          {
            position: objRef.current.position,
            restPosition: objRef.current.position,
            rotation: obj.rotation,
            isWalking: false,
          },
          websocketConnection,
          allConnections
        );
      }
    }
  }, [isRespawning]);

  // Handle position corrections from server
  useEffect(() => {
    if (positionCorrection && objRef.current) {
      console.log("Applying server position correction:", positionCorrection);

      // Stop any current movement
      if (currentTween) {
        TWEEN.remove(currentTween);
        setCurrentTween(null);
      }

      // Apply corrected position immediately
      const correctedPos = positionCorrection.correctedPosition;
      objRef.current.position.set(correctedPos.x, correctedPos.y, correctedPos.z);

      // Update global position state
      updateGlobalPosition();

      // Stop walking animation and return to idle
      actions["Walk"]?.stop();
      actions["Idle"]?.play();

      // Clear the correction from state
      clearPositionCorrection();

      console.log("Position corrected to:", correctedPos);
    }
  }, [positionCorrection]);

  const walkToPointOnLand = (pointOnLand) => {
    if (followingInterval) clearInterval(followingInterval);
    actions["Walk"]?.play();
    actions["RightHook"]?.stop();
    obj.lookAt(pointOnLand);

    // Smoothly transition position of character to clicked location
    if (currentTween) TWEEN.remove(currentTween);
    setCurrentTween(
      new TWEEN.Tween(objRef.current.position)
        .to(pointOnLand, objRef.current.position.distanceTo(pointOnLand) * 500)
        .onUpdate(onPositionUpdate)
        .onComplete(() => {
          actions["Walk"]?.stop();
          actions["Idle"]?.play();
          updateGlobalPosition(); // Update global position when movement completes
          webSocketSendUpdate(
            {
              position: objRef.current.position,
              restPosition: objRef.current.position,
              rotation: obj.rotation,
              attackingPlayer: userAttacking,
              isWalking: false,
            },
            websocketConnection,
            allConnections
          );
        })
        .start()
    );

    webSocketSendUpdate(
      {
        position: objRef.current.position,
        restPosition: pointOnLand,
        rotation: obj.rotation,
        attackingPlayer: userAttacking,
        isWalking: true,
      },
      websocketConnection,
      allConnections
    );
  };

  // Update global position state whenever player position changes
  const updateGlobalPosition = () => {
    if (objRef.current) {
      const currentPos = {
        x: objRef.current.position.x,
        y: objRef.current.position.y,
        z: objRef.current.position.z,
      };
      setPosition(currentPos);
    }
  };

  const onPositionUpdate = () => {
    // Update global position state
    updateGlobalPosition();

    // if clicked enemy
    if (!userFollowing) return;
    // if (!userFollowing.isCombatable) return;
    // Check if in attack range and attack
    const enemyLocation = userFollowing.current.position;
    const distance = objRef.current.position.distanceTo(enemyLocation);
    if (distance < 2 && userAttacking) {
      // attack
      actions["Walking"]?.stop();
      actions["RightHook"]?.play();
    } else {
      // stop attacking
      actions["Walking"]?.play();
      actions["RightHook"]?.stop();
    }
  };

  useEffect(() => {
    if (!userFollowing) return;
    clearInterval(followingInterval);
    setFollowingInterval(setInterval(walkTowardsOtherPlayer, 500));
    return () => clearInterval(followingInterval);
  }, [currentTween]);

  const walkTowardsOtherPlayer = () => {
    const separation = 1.5;
    const pointOnLand = userFollowing.current.position;
    const distance =
      objRef.current.position.distanceTo(pointOnLand) - separation;
    if (distance < 1) {
      onPositionUpdate();
      obj.lookAt(pointOnLand);
      webSocketSendUpdate(
        {
          position: objRef.current.position,
          restPosition: objRef.current.position,
          rotation: obj.rotation,
          isWalking: true,
          attackingPlayer: userAttacking,
        },
        websocketConnection,
        allConnections
      );
      return;
    }
    const dirV = new Vector3();
    const distV = new Vector3();
    const direction = dirV
      .subVectors(objRef.current.position, userFollowing.current.position)
      .normalize();
    // calculate vector that is towards clicked object but 1 unit away
    distV.addVectors(
      objRef.current.position,
      direction.multiplyScalar(-1 * distance)
    );
    walkToPointOnLand(distV);
  };

  useEffect(() => {
    // broadcast position
    if (!allConnections || allConnections.length === 0) return;
    webSocketSendUpdate(
      {
        position: objRef.current.position,
        restPosition: objRef.current.position,
        rotation: obj.rotation,
        isWalking: false,
        attackingPlayer: userAttacking,
      },
      websocketConnection,
      allConnections
    );
  }, [allConnections]);

  useEffect(() => {
    if (clickedPointOnLand) walkToPointOnLand(clickedPointOnLand);
  }, [clickedPointOnLand]);

  useEffect(() => {
    if (userFollowing) {
      walkTowardsOtherPlayer();
      setFollowingInterval(setInterval(walkTowardsOtherPlayer, 1000));
    }
    return () => clearInterval(followingInterval);
  }, [userFollowing]);

  useFrame(() => {
    TWEEN.update();
  });

  useEffect(() => {
    actions["Idle"]?.play();
    // Mark player model as loaded
    addLoadedAsset("native-woman.glb");
  }, [animations, mixer, addLoadedAsset]);

  useEffect(() => {
    props.setPlayerRef(objRef);
    if (objRef) {
      // Update global position state on mount
      updateGlobalPosition();

      webSocketSendUpdate(
        {
          position: objRef.current.position,
          restPosition: objRef.current.position,
          rotation: obj.rotation,
          isWalking: false,
        },
        websocketConnection,
        allConnections
      );
    }
  }, [objRef]);

  return (
    <group ref={objRef}>
      {justSentMessage && (
        <ChatBubble
          playerPosition={obj.position}
          yOffset={2}
          chatMessage={justSentMessage}
        />
      )}
      <>
        <HealthBar
          playerPosition={obj.position}
          health={Math.max(0, localHealth)}
          maxHealth={30}
          yOffset={2.5}
          isOwnPlayer={true}
        />
        {currentDamage && (
          <DamageNumber
            key={currentDamage.timestamp}
            playerPosition={obj.position}
            yOffset={1.5}
            damageToRender={currentDamage.val}
          />
        )}
        {isDead && (
          <ChatBubble
            playerPosition={obj.position}
            yOffset={3}
            chatMessage="💀 DEAD - Respawning..."
          />
        )}
        {isRespawning && (
          <ChatBubble
            playerPosition={obj.position}
            yOffset={3}
            chatMessage="✨ Respawning..."
          />
        )}
      </>
      <Suspense fallback={null}>
        <primitive
          object={obj}
          // Add visual feedback for death state
          scale={isDead ? [1, 1, 1] : [1, 1, 1]}
          // TODO: Add death animation effects here when available
        />
      </Suspense>
    </group>
  );
};

export default PlayerController;
