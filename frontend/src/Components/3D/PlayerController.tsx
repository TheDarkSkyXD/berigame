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

  // Attack animation timing - matches backend cooldown
  const [lastAttackAnimationTime, setLastAttackAnimationTime] = useState(Date.now() - 6000); // Initialize to allow immediate first attack
  const ATTACK_COOLDOWN_MS = 6000; // Match backend cooldown

  // Animation state management
  const [currentAnimationState, setCurrentAnimationState] = useState<'idle' | 'walk' | 'attack' | 'death'>('idle');
  const currentAnimationStateRef = useRef<'idle' | 'walk' | 'attack' | 'death'>('idle'); // Synchronous state tracking
  const animationLockRef = useRef(false); // Lock to prevent animation changes during critical periods
  const [attackAnimationTimeout, setAttackAnimationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [lastPositionUpdateTime, setLastPositionUpdateTime] = useState(0);

  // Spawn location - center of the island
  const SPAWN_LOCATION = { x: 0, y: 0, z: 0 };

  // Centralized animation control function
  const playAnimation = (newState: 'idle' | 'walk' | 'attack' | 'death', force: boolean = false) => {
    // Check animation lock (unless forced)
    if (!force && animationLockRef.current) {
      console.log(`🔒 Animation locked, skipping: ${newState}`);
      return;
    }

    // Use ref for synchronous state checking to prevent redundant calls
    if (currentAnimationStateRef.current === newState) {
      console.log(`🎭 Skipping redundant animation call: ${newState}`);
      return; // Don't restart same animation
    }

    console.log(`🎭 Animation transition: ${currentAnimationStateRef.current} -> ${newState}`);

    // Clear any existing attack timeout
    if (attackAnimationTimeout) {
      clearTimeout(attackAnimationTimeout);
      setAttackAnimationTimeout(null);
    }

    // Stop all animations first
    actions["Idle"]?.stop();
    actions["Walk"]?.stop();
    actions["RightHook"]?.stop();

    // Update both state and ref immediately
    currentAnimationStateRef.current = newState;
    setCurrentAnimationState(newState);

    // Play the requested animation
    switch (newState) {
      case 'idle':
        actions["Idle"]?.play();
        console.log(`🎭 Playing Idle animation`);
        animationLockRef.current = false; // Release lock for idle
        break;
      case 'walk':
        actions["Walk"]?.play();
        console.log(`🎭 Playing Walk animation`);
        animationLockRef.current = false; // Release lock for walk
        break;
      case 'attack':
        actions["RightHook"]?.play();
        console.log(`🎭 Playing Attack animation`);
        animationLockRef.current = true; // Lock during attack
        // Set timeout to return to idle after attack animation
        const timeout = setTimeout(() => {
          console.log(`🎭 Attack animation complete, returning to idle`);
          // Only transition to idle if we're still in attack state (not interrupted)
          if (currentAnimationStateRef.current === 'attack') {
            currentAnimationStateRef.current = 'idle';
            setCurrentAnimationState('idle');
            actions["RightHook"]?.stop();
            actions["Idle"]?.play();
            animationLockRef.current = false; // Release lock
          }
          setAttackAnimationTimeout(null);
        }, 1000);
        setAttackAnimationTimeout(timeout);
        break;
      case 'death':
        console.log(`🎭 Playing Death animation (stopping all)`);
        animationLockRef.current = true; // Lock during death
        // All animations already stopped above
        break;
    }
  };

  // Cleanup expired damage numbers with proper timing
  useEffect(() => {
    if (!currentDamage) return;

    const timeoutId = setTimeout(() => {
      console.log(`💥 Damage counter expired for own player: ${currentDamage?.val}`);
      setCurrentDamage(null);
    }, 1400);

    return () => clearTimeout(timeoutId);
  }, [currentDamage]);

  useEffect(() => {
    // Set damage to render variables for own player
    const userDamage = damageToRender[userConnectionId];
    if (userDamage !== null && userDamage !== undefined) {
      console.log(`💥 Setting damage counter for own player: ${userDamage}`);
      // Only set the damage number, let backend health update handle the actual health value
      setCurrentDamage({ val: userDamage, timestamp: Date.now() });
      removeDamageToRender(userConnectionId);
    }
  }, [damageToRender]);



  // Sync local health with global health state (updated by backend)
  useEffect(() => {
    console.log(`❤️ Own player health updated: ${localHealth} -> ${health}`);
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
      playAnimation('death');

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
        playAnimation('idle');

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
      playAnimation('idle');

      // Clear the correction from state
      clearPositionCorrection();

      console.log("Position corrected to:", correctedPos);
    }
  }, [positionCorrection]);

  const walkToPointOnLand = (pointOnLand) => {
    if (followingInterval) clearInterval(followingInterval);
    playAnimation('walk');
    obj.lookAt(pointOnLand);

    // Smoothly transition position of character to clicked location
    if (currentTween) TWEEN.remove(currentTween);
    setCurrentTween(
      new TWEEN.Tween(objRef.current.position)
        .to(pointOnLand, objRef.current.position.distanceTo(pointOnLand) * 500)
        .onUpdate(onPositionUpdate)
        .onComplete(() => {
          playAnimation('idle');
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

    // Debounce position updates to prevent rapid attack triggering
    const currentTime = Date.now();
    if (currentTime - lastPositionUpdateTime < 200) {
      return; // Skip if called too frequently
    }
    setLastPositionUpdateTime(currentTime);

    // if clicked enemy
    if (!userFollowing) return;
    // if (!userFollowing.isCombatable) return;
    // Check if in attack range and attack
    const enemyLocation = userFollowing.current.position;
    const distance = objRef.current.position.distanceTo(enemyLocation);

    if (distance < 2 && userAttacking) {
      // If already attacking, don't interrupt the animation
      if (currentAnimationStateRef.current === 'attack') {
        return; // Let the attack animation complete
      }

      // Check if enough time has passed since last attack animation
      const currentTime = Date.now();
      const timeSinceLastAttack = currentTime - lastAttackAnimationTime;

      if (timeSinceLastAttack >= ATTACK_COOLDOWN_MS) {
        // Play attack animation and reset timer
        setLastAttackAnimationTime(currentTime);
        playAnimation('attack');
        console.log(`🎬 Playing attack animation (cooldown: ${timeSinceLastAttack}ms)`);
      } else {
        // Still in cooldown, stay in idle
        playAnimation('idle');
        console.log(`⏳ Attack on cooldown (${ATTACK_COOLDOWN_MS - timeSinceLastAttack}ms remaining)`);
      }
    } else {
      // Not in range or not attacking
      if (currentAnimationStateRef.current === 'attack') {
        return; // Don't interrupt attack animations
      }

      if (distance >= 2) {
        playAnimation('walk');
      } else {
        playAnimation('idle');
      }
    }
  };

  useEffect(() => {
    if (!userFollowing) return;
    clearInterval(followingInterval);
    // Reduce frequency to prevent rapid attack triggering
    setFollowingInterval(setInterval(walkTowardsOtherPlayer, 1000));
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
      // Use consistent 1000ms interval
      setFollowingInterval(setInterval(walkTowardsOtherPlayer, 1000));
    }
    return () => clearInterval(followingInterval);
  }, [userFollowing]);

  useFrame(() => {
    TWEEN.update();
  });

  // Cleanup attack timeout on unmount
  useEffect(() => {
    return () => {
      if (attackAnimationTimeout) {
        clearTimeout(attackAnimationTimeout);
      }
    };
  }, [attackAnimationTimeout]);

  useEffect(() => {
    // Initialize animation state
    currentAnimationStateRef.current = 'idle';
    playAnimation('idle', true); // Force initial animation
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
          <>
            {console.log(`💥 Rendering damage component for own player: ${currentDamage.val} at ${currentDamage.timestamp}`)}
            <DamageNumber
              key={currentDamage.timestamp}
              playerPosition={obj.position}
              yOffset={1.5}
              damageToRender={currentDamage.val}
            />
          </>
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
