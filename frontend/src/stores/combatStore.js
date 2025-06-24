import { create } from 'zustand';

/**
 * Unified Combat State Store
 * 
 * This store consolidates all combat-related state including:
 * - Player health (own and others)
 * - Damage rendering
 * - Combat status
 * - Death/respawn states
 * 
 * Prevents race conditions by managing health and damage updates atomically.
 */
export const useCombatStore = create((set, get) => ({
  // Player health data - single source of truth
  playerHealths: {}, // playerId -> { current: number, max: number, lastUpdated: timestamp }
  
  // Damage display data
  damageToRender: {}, // playerId -> { damage: number, timestamp: number, id: string }
  
  // Combat status
  combatStates: {}, // playerId -> { inCombat: boolean, isAttacking: boolean, lastAttack: timestamp }
  
  // Death states
  deathStates: {}, // playerId -> { isDead: boolean, isRespawning: boolean, deathTime: timestamp }

  // Actions for health management
  setPlayerHealth: (playerId, health, maxHealth = 30) => {
    set((state) => {
      const timestamp = Date.now();
      console.log(`❤️ Combat Store: Setting health for ${playerId}: ${health}/${maxHealth}`);
      
      const newHealths = {
        ...state.playerHealths,
        [playerId]: {
          current: Math.max(0, health),
          max: maxHealth,
          lastUpdated: timestamp,
        },
      };

      // Update death state if health reaches 0
      const newDeathStates = { ...state.deathStates };
      if (health <= 0 && (!state.deathStates[playerId] || !state.deathStates[playerId].isDead)) {
        newDeathStates[playerId] = {
          isDead: true,
          isRespawning: false,
          deathTime: timestamp,
        };
        console.log(`💀 Combat Store: Player ${playerId} died`);
      } else if (health > 0 && state.deathStates[playerId]?.isDead) {
        newDeathStates[playerId] = {
          isDead: false,
          isRespawning: false,
          deathTime: null,
        };
        console.log(`✨ Combat Store: Player ${playerId} respawned`);
      }

      return {
        playerHealths: newHealths,
        deathStates: newDeathStates,
      };
    });
  },

  // Atomic damage and health update - prevents race conditions
  applyDamageAndUpdateHealth: (attackerId, targetId, damage, newHealth, maxHealth = 30) => {
    set((state) => {
      const timestamp = Date.now();
      const damageId = `${attackerId}-${targetId}-${timestamp}`;
      
      console.log(`💥 Combat Store: Applying damage ${damage} from ${attackerId} to ${targetId}, new health: ${newHealth}`);

      // Update damage to render
      const newDamageToRender = {
        ...state.damageToRender,
        [targetId]: {
          damage,
          timestamp,
          id: damageId,
          attackerId,
        },
      };

      // Update target health
      const newHealths = {
        ...state.playerHealths,
        [targetId]: {
          current: Math.max(0, newHealth),
          max: maxHealth,
          lastUpdated: timestamp,
        },
      };

      // Update death state if health reaches 0
      const newDeathStates = { ...state.deathStates };
      if (newHealth <= 0 && (!state.deathStates[targetId] || !state.deathStates[targetId].isDead)) {
        newDeathStates[targetId] = {
          isDead: true,
          isRespawning: false,
          deathTime: timestamp,
        };
        console.log(`💀 Combat Store: Player ${targetId} died from damage`);
      }

      // Update combat states
      const newCombatStates = {
        ...state.combatStates,
        [attackerId]: {
          ...state.combatStates[attackerId],
          inCombat: true,
          isAttacking: true,
          lastAttack: timestamp,
        },
        [targetId]: {
          ...state.combatStates[targetId],
          inCombat: true,
          isAttacking: false,
          lastAttack: state.combatStates[targetId]?.lastAttack || 0,
        },
      };

      return {
        damageToRender: newDamageToRender,
        playerHealths: newHealths,
        deathStates: newDeathStates,
        combatStates: newCombatStates,
      };
    });
  },

  // Clear damage display after animation
  clearDamageDisplay: (playerId) => {
    set((state) => {
      const newDamageToRender = { ...state.damageToRender };
      delete newDamageToRender[playerId];
      
      console.log(`💥 Combat Store: Cleared damage display for ${playerId}`);
      
      return {
        damageToRender: newDamageToRender,
      };
    });
  },

  // Update combat state
  setCombatState: (playerId, inCombat, isAttacking = false) => {
    set((state) => ({
      combatStates: {
        ...state.combatStates,
        [playerId]: {
          ...state.combatStates[playerId],
          inCombat,
          isAttacking,
          lastAttack: isAttacking ? Date.now() : (state.combatStates[playerId]?.lastAttack || 0),
        },
      },
    }));
  },

  // Update death/respawn state
  setDeathState: (playerId, isDead, isRespawning = false) => {
    set((state) => {
      const timestamp = Date.now();
      console.log(`💀 Combat Store: Setting death state for ${playerId}: dead=${isDead}, respawning=${isRespawning}`);
      
      return {
        deathStates: {
          ...state.deathStates,
          [playerId]: {
            isDead,
            isRespawning,
            deathTime: isDead ? timestamp : null,
          },
        },
      };
    });
  },

  // Getters for computed values
  getPlayerHealth: (playerId) => {
    const state = get();
    return state.playerHealths[playerId] || { current: 30, max: 30, lastUpdated: 0 };
  },

  getPlayerDamage: (playerId) => {
    const state = get();
    return state.damageToRender[playerId] || null;
  },

  getPlayerCombatState: (playerId) => {
    const state = get();
    return state.combatStates[playerId] || { inCombat: false, isAttacking: false, lastAttack: 0 };
  },

  getPlayerDeathState: (playerId) => {
    const state = get();
    return state.deathStates[playerId] || { isDead: false, isRespawning: false, deathTime: null };
  },

  // Cleanup expired combat states
  cleanupExpiredStates: () => {
    set((state) => {
      const now = Date.now();
      const COMBAT_TIMEOUT = 10000; // 10 seconds
      const DAMAGE_TIMEOUT = 2000; // 2 seconds
      
      // Clean up expired combat states
      const newCombatStates = { ...state.combatStates };
      Object.keys(newCombatStates).forEach(playerId => {
        const combatState = newCombatStates[playerId];
        if (combatState.inCombat && (now - combatState.lastAttack) > COMBAT_TIMEOUT) {
          newCombatStates[playerId] = {
            ...combatState,
            inCombat: false,
            isAttacking: false,
          };
        }
      });

      // Clean up expired damage displays
      const newDamageToRender = { ...state.damageToRender };
      Object.keys(newDamageToRender).forEach(playerId => {
        const damage = newDamageToRender[playerId];
        if (damage && (now - damage.timestamp) > DAMAGE_TIMEOUT) {
          delete newDamageToRender[playerId];
        }
      });

      return {
        combatStates: newCombatStates,
        damageToRender: newDamageToRender,
      };
    });
  },

  // Reset all combat state (useful for disconnections)
  resetCombatState: () => {
    set(() => ({
      playerHealths: {},
      damageToRender: {},
      combatStates: {},
      deathStates: {},
    }));
    console.log('🔄 Combat Store: Reset all combat state');
  },
}));
