/**
 * Test file for the unified combat store
 * This file demonstrates the new combat state management functionality
 */

import { useCombatStore } from '../stores/combatStore';

// Test the combat store functionality
const testCombatStore = () => {
  console.log('🧪 Testing Combat Store Functionality');
  
  const store = useCombatStore.getState();
  
  // Test 1: Set player health
  console.log('Test 1: Setting player health');
  store.setPlayerHealth('player1', 25, 30);
  const health1 = store.getPlayerHealth('player1');
  console.log('Player 1 health:', health1);
  console.assert(health1.current === 25, 'Health should be 25');
  console.assert(health1.max === 30, 'Max health should be 30');
  
  // Test 2: Apply damage and update health atomically
  console.log('Test 2: Applying damage atomically');
  store.applyDamageAndUpdateHealth('attacker1', 'player1', 10, 15);
  const health2 = store.getPlayerHealth('player1');
  const damage1 = store.getPlayerDamage('player1');
  console.log('Player 1 health after damage:', health2);
  console.log('Player 1 damage to render:', damage1);
  console.assert(health2.current === 15, 'Health should be 15 after damage');
  console.assert(damage1.damage === 10, 'Damage should be 10');
  
  // Test 3: Death state management
  console.log('Test 3: Death state management');
  store.applyDamageAndUpdateHealth('attacker1', 'player1', 20, 0);
  const deathState = store.getPlayerDeathState('player1');
  console.log('Player 1 death state:', deathState);
  console.assert(deathState.isDead === true, 'Player should be dead');
  
  // Test 4: Combat state management
  console.log('Test 4: Combat state management');
  const combatState = store.getPlayerCombatState('attacker1');
  console.log('Attacker combat state:', combatState);
  console.assert(combatState.inCombat === true, 'Attacker should be in combat');
  console.assert(combatState.isAttacking === true, 'Attacker should be attacking');
  
  // Test 5: Respawn functionality
  console.log('Test 5: Respawn functionality');
  store.setPlayerHealth('player1', 30, 30);
  store.setDeathState('player1', false, false);
  const healthAfterRespawn = store.getPlayerHealth('player1');
  const deathStateAfterRespawn = store.getPlayerDeathState('player1');
  console.log('Player 1 health after respawn:', healthAfterRespawn);
  console.log('Player 1 death state after respawn:', deathStateAfterRespawn);
  console.assert(healthAfterRespawn.current === 30, 'Health should be restored to 30');
  console.assert(deathStateAfterRespawn.isDead === false, 'Player should not be dead');
  
  console.log('✅ All combat store tests passed!');
};

// Export for use in development
if (typeof window !== 'undefined') {
  window.testCombatStore = testCombatStore;
}

export { testCombatStore };
