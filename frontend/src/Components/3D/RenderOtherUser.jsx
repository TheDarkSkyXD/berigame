import { Html, useAnimations, useGLTF } from "@react-three/drei";
import TWEEN from "@tweenjs/tween.js";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils";
import {
  BoxBufferGeometry,
  BoxGeometry,
  MeshBasicMaterial,
  Vector3,
} from "three";
import {
  useOtherUsersStore,
  useUserInputStore,
  useUserStateStore,
} from "../../store";
import { useCombatState } from "../../hooks/useCombatState";
import ChatBubble from "./ChatBubble";
import HealthBar from "./HealthBar";
import DamageNumber from "./DamageNumber";

const RenderOtherUser = ({
  url = "native-woman.glb",
  position,
  rotation,
  restPosition,
  isWalking,
  messagesToRender,
  isCombatable = false,
  inCombat = false,
  isAttacking = false,
  inAttackCooldown = false,
  animationState = null, // New unified animation state
  connectionId = "NPC",
}) => {
  const { scene, animations, materials } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone);
  const copiedScene = nodes.Scene;
  const { actions, mixer } = useAnimations(animations, copiedScene);
  const [currentTween, setCurrentTween] = useState(null);
  const objRef = useRef();
  const hitBox = new BoxGeometry(1, 5.5, 1);
  const hitBoxMaterial = new MeshBasicMaterial({ visible: false });
  const setClickedOtherObject = useUserInputStore(
    (state) => state.setClickedOtherObject
  );
  const setUserFollowing = useUserStateStore((state) => state.setUserFollowing);
  const setUserAttacking = useUserStateStore((state) => state.setUserAttacking);

  // Use unified combat state for this player
  const combatState = useCombatState(connectionId);

  // Animation state management for other players
  const [currentAnimationState, setCurrentAnimationState] = useState('idle');
  const [attackAnimationTimeout, setAttackAnimationTimeout] = useState(null);

  // Helper function to determine the desired animation state
  const getDesiredAnimationState = () => {
    // Use new unified animation state if available
    if (animationState) {
      return animationState === 'attack_cooldown' ? 'idle' : animationState;
    }

    // Fallback to legacy logic for backward compatibility
    if (isAttacking) return 'attack';
    if (inAttackCooldown) return 'idle';
    if (isWalking) return 'walk';
    return 'idle';
  };

  // Centralized animation control function for other players
  const playAnimation = (newState) => {
    if (currentAnimationState === newState) {
      return; // Don't restart same animation
    }

    console.log(`🎭 Other player ${connectionId} animation transition: ${currentAnimationState} -> ${newState}`);

    // Clear any existing attack timeout
    if (attackAnimationTimeout) {
      clearTimeout(attackAnimationTimeout);
      setAttackAnimationTimeout(null);
    }

    // Stop all animations first
    actions["Idle"]?.stop();
    actions["Walk"]?.stop();
    actions["RightHook"]?.stop();

    // Update animation state
    setCurrentAnimationState(newState);

    // Play the requested animation
    switch (newState) {
      case 'idle':
        actions["Idle"]?.play();
        console.log(`🎭 Other player ${connectionId} playing Idle animation`);
        break;
      case 'walk':
        actions["Walk"]?.play();
        console.log(`🎭 Other player ${connectionId} playing Walk animation`);
        break;
      case 'attack':
        actions["RightHook"]?.play();
        console.log(`🎭 Other player ${connectionId} playing Attack animation`);
        // Set timeout to return to idle after attack animation (1 second like PlayerController)
        const timeout = setTimeout(() => {
          console.log(`🎭 Other player ${connectionId} attack animation complete, returning to idle`);
          // Only transition to idle if we're still in attack state (not interrupted)
          if (currentAnimationState === 'attack') {
            setCurrentAnimationState('idle');
            actions["RightHook"]?.stop();
            actions["Idle"]?.play();
          }
          setAttackAnimationTimeout(null);
        }, 1000);
        setAttackAnimationTimeout(timeout);
        break;
      case 'death':
        console.log(`🎭 Other player ${connectionId} playing Death animation (stopping all)`);
        // All animations already stopped above
        break;
    }
  };

  // Handle death/respawn animations based on combat state
  useEffect(() => {
    if (combatState.isDead) {
      console.log(`Other player ${connectionId} appears to have died`);
      playAnimation('death');
    } else if (!combatState.isDead && combatState.health > 0) {
      // If player is alive and was dead, return to idle
      if (currentAnimationState === 'death') {
        playAnimation('idle');
      }
    }
  }, [combatState.isDead, combatState.health, connectionId]);

  // Handle animation state changes - simplified with unified state
  useEffect(() => {
    const desiredState = getDesiredAnimationState();

    if (desiredState !== currentAnimationState) {
      console.log(`🎭 Other player ${connectionId} animation change: ${currentAnimationState} -> ${desiredState}`);
      playAnimation(desiredState);
    }
  }, [animationState, isAttacking, inAttackCooldown, isWalking, connectionId]);

  useEffect(() => {
    if (!isWalking)
      objRef.current.position.set(position[0], position[1], position[2]);
  }, [position]);

  const isSameCoordinates = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  useEffect(() => {
    const restPositionV3 = new Vector3(
      restPosition[0],
      restPosition[1],
      restPosition[2]
    );
    if (isWalking) {
      if (currentTween) TWEEN.remove(currentTween);
      if (isSameCoordinates(rotation, [0, 0, 0])) {
        copiedScene.lookAt(restPositionV3);
      }
      if (isSameCoordinates(objRef.current.position, restPositionV3)) return;

      // Use centralized animation system for walking
      if (!isAttacking) { // Don't interrupt attack animations
        playAnimation('walk');
      }

      setCurrentTween(
        new TWEEN.Tween(objRef.current.position)
          .to(
            restPositionV3,
            objRef.current.position.distanceTo(restPositionV3) * 500
          )
          .onComplete(() => {
            // Use centralized animation system when walk completes
            if (!isAttacking) { // Don't interrupt attack animations
              playAnimation('idle');
            }
          })
          .start()
      );
    } else {
      // When not walking, return to idle if not attacking
      if (currentAnimationState === 'walk' && !isAttacking) {
        playAnimation('idle');
      }
    }
  }, [isWalking, restPosition]);

  useFrame(() => {
    TWEEN.update();
  });

  useEffect(() => {
    // Initialize with idle animation using centralized system
    playAnimation('idle');
  }, [animations, mixer]);

  const materialChange = () => {
    for (const material of Object.keys(materials)) {
      materials[material].userData.originalColor =
        "0x" + materials[material].color.getHexString();
      if (isCombatable) materials[material].color.setHex(0xff0000);
      else materials[material].color.setHex(0x00ff00);
    }
  };

  const clearMaterialChange = () => {
    for (const material of Object.keys(materials))
      materials[material].color.setHex(
        materials[material].userData.originalColor
      );
  };

  const onClick = (e) => {
    e.stopPropagation();
    materialChange();
    setClickedOtherObject({
      ...objRef,
      isCombatable,
      connectionId,
      e,
      dropdownOptions: [
        {
          label: "Follow",
          onClick: () => {
            setUserFollowing(objRef);
            setUserAttacking(false);
            setClickedOtherObject(null);
          },
        },
        {
          label: "Attack",
          onClick: () => {
            setUserFollowing(objRef);
            setUserAttacking(connectionId);
            setClickedOtherObject(null);
          },
        },
      ],
    });
    setTimeout(() => {
      clearMaterialChange();
    }, 150);
  };

  return (
    <group ref={objRef} onClick={onClick}>
      <mesh geometry={hitBox} material={hitBoxMaterial} />
      {connectionId !== "NPC" && (
        <>
          <HealthBar
            playerPosition={copiedScene.position}
            health={Math.max(0, combatState.health)}
            maxHealth={combatState.maxHealth}
            yOffset={2.5}
            isOwnPlayer={false}
          />
          {combatState.damage !== null && (
            <DamageNumber
              key={`damage-${connectionId}-${combatState.damageTimestamp}`}
              playerPosition={copiedScene.position}
              yOffset={1.5}
              damageToRender={combatState.damage}
            />
          )}
          {combatState.isDead && (
            <ChatBubble
              playerPosition={copiedScene.position}
              yOffset={3.5}
              chatMessage="💀 DEAD"
            />
          )}
        </>
      )}
      {messagesToRender && (
        <ChatBubble
          playerPosition={copiedScene.position}
          yOffset={3.2}
          chatMessage={messagesToRender}
        />
      )}
      <Suspense fallback={null}>
        <primitive object={copiedScene} rotation={rotation} />
      </Suspense>
    </group>
  );
};

export default RenderOtherUser;
