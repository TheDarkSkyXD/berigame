# Combat State Management Refactor

## Overview

This refactor consolidates all combat-related state management into a unified system to eliminate race conditions and provide a single source of truth for player health, damage display, and combat status.

## Problems Solved

### Before Refactor
- **Multiple Sources of Truth**: Health stored in `useUserStateStore.health`, `useOtherUsersStore.playerHealths`, and local component state
- **Race Conditions**: Damage display and health updates handled separately, causing sync issues
- **Scattered Logic**: Combat state management spread across multiple components and stores
- **Inconsistent State**: Local health state could get out of sync with centralized health

### After Refactor
- **Single Source of Truth**: All combat state in `useCombatStore`
- **Atomic Updates**: Health and damage updates happen together to prevent race conditions
- **Centralized Logic**: All combat-related operations in one place
- **Synchronized State**: Consistent state across all components

## New Architecture

### Core Store: `useCombatStore`
Located in `frontend/src/stores/combatStore.js`

**State Structure:**
```javascript
{
  playerHealths: {}, // playerId -> { current, max, lastUpdated }
  damageToRender: {}, // playerId -> { damage, timestamp, id, attackerId }
  combatStates: {}, // playerId -> { inCombat, isAttacking, lastAttack }
  deathStates: {} // playerId -> { isDead, isRespawning, deathTime }
}
```

**Key Actions:**
- `setPlayerHealth(playerId, health, maxHealth)` - Update player health
- `applyDamageAndUpdateHealth(attackerId, targetId, damage, newHealth)` - Atomic damage application
- `setDeathState(playerId, isDead, isRespawning)` - Manage death/respawn state
- `setCombatState(playerId, inCombat, isAttacking)` - Update combat status

### Custom Hooks

#### `useCombatState(playerId)`
General combat state hook for any player.

**Returns:**
```javascript
{
  health, maxHealth, damage, damageTimestamp,
  inCombat, isAttacking, isDead, isRespawning,
  updateHealth, applyDamage, updateCombatState, updateDeathState,
  isHealthy, healthPercentage, timeSinceLastDamage
}
```

#### `useOwnPlayerCombatState(playerId)`
Enhanced hook for the current player with additional functionality.

**Additional Features:**
- `canAttack()` - Check if player can attack (cooldown logic)
- `getAttackCooldownRemaining()` - Get remaining cooldown time
- `attackCooldownRemaining` - Current cooldown remaining

## Migration Guide

### Component Updates

#### PlayerController.tsx
**Before:**
```javascript
const health = useUserStateStore((state) => state.health);
const isDead = useUserStateStore((state) => state.isDead);
const damageToRender = useOtherUsersStore((state) => state.damageToRender);
const [localHealth, setLocalHealth] = useState(30);
const [currentDamage, setCurrentDamage] = useState(null);
```

**After:**
```javascript
const combatState = useOwnPlayerCombatState(userConnectionId);
// Access via: combatState.health, combatState.isDead, combatState.damage
```

#### RenderOtherUser.jsx
**Before:**
```javascript
const playerHealths = useOtherUsersStore((state) => state.playerHealths);
const damageToRender = useOtherUsersStore((state) => state.damageToRender);
const [localHealth, setLocalHealth] = useState(30);
const [currentDamage, setCurrentDamage] = useState(null);
```

**After:**
```javascript
const combatState = useCombatState(connectionId);
// Access via: combatState.health, combatState.damage, combatState.isDead
```

#### Api.tsx
**Before:**
```javascript
const addDamageToRender = useOtherUsersStore((state) => state.addDamageToRender);
const setPlayerHealth = useOtherUsersStore((state) => state.setPlayerHealth);
const setHealth = useUserStateStore((state) => state.setHealth);
const setIsDead = useUserStateStore((state) => state.setIsDead);
```

**After:**
```javascript
const { applyDamageAndUpdateHealth, setPlayerHealth, setDeathState } = useCombatStore();
```

## Benefits

1. **Race Condition Prevention**: Atomic updates ensure health and damage are always in sync
2. **Simplified State Management**: Single store for all combat-related state
3. **Better Performance**: Reduced re-renders and state synchronization overhead
4. **Improved Debugging**: Centralized logging and state inspection
5. **Type Safety**: Better TypeScript support with unified interfaces
6. **Easier Testing**: Isolated combat logic for unit testing

## Testing

Run the combat store test:
```javascript
// In browser console
window.testCombatStore();
```

Or import in development:
```javascript
import { testCombatStore } from './tests/combatStore.test.js';
testCombatStore();
```

## Backward Compatibility

The refactor maintains the same external API behavior while consolidating internal state management. All existing game mechanics continue to work as expected.

## Files Modified

- `frontend/src/stores/combatStore.js` - New unified combat store
- `frontend/src/hooks/useCombatState.js` - Custom hooks for combat state
- `frontend/src/store.js` - Removed combat state from existing stores
- `frontend/src/Components/Api.tsx` - Updated to use combat store
- `frontend/src/Components/3D/PlayerController.tsx` - Refactored to use combat hooks
- `frontend/src/Components/3D/RenderOtherUser.jsx` - Refactored to use combat hooks
- `frontend/src/tests/combatStore.test.js` - Test suite for combat store
