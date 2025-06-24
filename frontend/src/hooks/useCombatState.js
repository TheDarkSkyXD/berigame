import { useEffect, useCallback } from 'react';
import { useCombatStore } from '../stores/combatStore';

/**
 * Custom hook for managing combat state
 * Provides a clean interface for components to interact with combat state
 */
export const useCombatState = (playerId) => {
  const {
    playerHealths,
    damageToRender,
    combatStates,
    deathStates,
    setPlayerHealth,
    applyDamageAndUpdateHealth,
    clearDamageDisplay,
    setCombatState,
    setDeathState,
    getPlayerHealth,
    getPlayerDamage,
    getPlayerCombatState,
    getPlayerDeathState,
    cleanupExpiredStates,
  } = useCombatStore();

  // Get current state for this player
  const health = getPlayerHealth(playerId);
  const damage = getPlayerDamage(playerId);
  const combatState = getPlayerCombatState(playerId);
  const deathState = getPlayerDeathState(playerId);

  // Cleanup expired states periodically
  useEffect(() => {
    const interval = setInterval(() => {
      cleanupExpiredStates();
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [cleanupExpiredStates]);

  // Auto-clear damage display after animation duration
  useEffect(() => {
    if (damage) {
      const timeout = setTimeout(() => {
        clearDamageDisplay(playerId);
      }, 1400); // Match damage animation duration

      return () => clearTimeout(timeout);
    }
  }, [damage, playerId, clearDamageDisplay]);

  // Memoized action creators
  const updateHealth = useCallback((newHealth, maxHealth = 30) => {
    setPlayerHealth(playerId, newHealth, maxHealth);
  }, [playerId, setPlayerHealth]);

  const applyDamage = useCallback((attackerId, damage, newHealth, maxHealth = 30) => {
    applyDamageAndUpdateHealth(attackerId, playerId, damage, newHealth, maxHealth);
  }, [playerId, applyDamageAndUpdateHealth]);

  const updateCombatState = useCallback((inCombat, isAttacking = false) => {
    setCombatState(playerId, inCombat, isAttacking);
  }, [playerId, setCombatState]);

  const updateDeathState = useCallback((isDead, isRespawning = false) => {
    setDeathState(playerId, isDead, isRespawning);
  }, [playerId, setDeathState]);

  const clearDamage = useCallback(() => {
    clearDamageDisplay(playerId);
  }, [playerId, clearDamageDisplay]);

  return {
    // Current state
    health: health.current,
    maxHealth: health.max,
    damage: damage?.damage || null,
    damageTimestamp: damage?.timestamp || null,
    inCombat: combatState.inCombat,
    isAttacking: combatState.isAttacking,
    isDead: deathState.isDead,
    isRespawning: deathState.isRespawning,
    
    // Actions
    updateHealth,
    applyDamage,
    updateCombatState,
    updateDeathState,
    clearDamage,
    
    // Computed values
    isHealthy: health.current === health.max,
    healthPercentage: (health.current / health.max) * 100,
    timeSinceLastDamage: damage ? Date.now() - damage.timestamp : Infinity,
  };
};

/**
 * Hook for managing own player combat state
 * Includes additional logic specific to the current player
 */
export const useOwnPlayerCombatState = (playerId) => {
  const combatState = useCombatState(playerId);
  
  // Additional logic for own player
  const canAttack = useCallback(() => {
    const { combatStates } = useCombatStore.getState();
    const playerCombat = combatStates[playerId];
    if (!playerCombat) return true;
    
    const ATTACK_COOLDOWN = 6000; // 6 seconds
    return Date.now() - playerCombat.lastAttack >= ATTACK_COOLDOWN;
  }, [playerId]);

  const getAttackCooldownRemaining = useCallback(() => {
    const { combatStates } = useCombatStore.getState();
    const playerCombat = combatStates[playerId];
    if (!playerCombat) return 0;
    
    const ATTACK_COOLDOWN = 6000; // 6 seconds
    const elapsed = Date.now() - playerCombat.lastAttack;
    return Math.max(0, ATTACK_COOLDOWN - elapsed);
  }, [playerId]);

  return {
    ...combatState,
    canAttack,
    getAttackCooldownRemaining,
    attackCooldownRemaining: getAttackCooldownRemaining(),
  };
};

/**
 * Hook for managing multiple players' combat state
 * Useful for components that need to track multiple players
 */
export const useMultiPlayerCombatState = (playerIds) => {
  const store = useCombatStore();
  
  const playersState = playerIds.reduce((acc, playerId) => {
    acc[playerId] = {
      health: store.getPlayerHealth(playerId),
      damage: store.getPlayerDamage(playerId),
      combatState: store.getPlayerCombatState(playerId),
      deathState: store.getPlayerDeathState(playerId),
    };
    return acc;
  }, {});

  return {
    playersState,
    // Bulk actions
    updateMultipleHealths: useCallback((healthUpdates) => {
      healthUpdates.forEach(({ playerId, health, maxHealth }) => {
        store.setPlayerHealth(playerId, health, maxHealth);
      });
    }, [store]),
    
    resetAllStates: useCallback(() => {
      store.resetCombatState();
    }, [store]),
  };
};
