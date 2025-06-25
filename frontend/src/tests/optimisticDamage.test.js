import { vi } from 'vitest';
import { useCombatStore } from '../stores/combatStore';

/**
 * Comprehensive tests for optimistic damage system
 * Tests optimistic updates, server verification, and rollback scenarios
 */

describe('Optimistic Damage System', () => {
  let store;

  beforeEach(() => {
    // Get a fresh store instance for each test
    store = useCombatStore.getState();
    // Reset store state
    store.resetCombatState();
  });

  describe('Optimistic Damage Application', () => {
    test('should apply optimistic damage immediately', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 2;

      // Apply optimistic damage
      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Check that transaction ID is returned
      expect(transactionId).toBeDefined();
      expect(transactionId).toMatch(/^opt-attacker1-target1-\d+-[a-z0-9]+$/);

      // Check optimistic damage is stored
      const optimisticDamage = store.getOptimisticDamage(targetId);
      expect(optimisticDamage).toEqual({
        damage: estimatedDamage,
        timestamp: expect.any(Number),
        transactionId,
        attackerId,
        isPending: true,
      });

      // Check pending verification is tracked
      const pendingVerifications = store.getPendingVerifications();
      expect(pendingVerifications[transactionId]).toEqual({
        playerId: targetId,
        damage: estimatedDamage,
        attackerId,
        timestamp: expect.any(Number),
      });

      // Check combat states are updated
      const attackerCombat = store.getPlayerCombatState(attackerId);
      const targetCombat = store.getPlayerCombatState(targetId);
      
      expect(attackerCombat.inCombat).toBe(true);
      expect(attackerCombat.isAttacking).toBe(true);
      expect(targetCombat.inCombat).toBe(true);
      expect(targetCombat.isAttacking).toBe(false);
    });

    test('should return optimistic damage in getPlayerDamage', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 3;

      // Apply optimistic damage
      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Get player damage should return optimistic damage
      const damage = store.getPlayerDamage(targetId);
      expect(damage).toEqual({
        damage: estimatedDamage,
        timestamp: expect.any(Number),
        transactionId,
        attackerId,
        isPending: true,
        isOptimistic: true,
      });
    });
  });

  describe('Server Verification - Success', () => {
    test('should confirm optimistic damage with server response', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 2;
      const actualDamage = 3;
      const newHealth = 25;

      // Apply optimistic damage
      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Simulate server confirmation
      store.applyDamageAndUpdateHealth(attackerId, targetId, actualDamage, newHealth, 30, transactionId);

      // Check optimistic damage is cleared
      const optimisticDamage = store.getOptimisticDamage(targetId);
      expect(optimisticDamage).toBeNull();

      // Check pending verification is cleared
      const pendingVerifications = store.getPendingVerifications();
      expect(pendingVerifications[transactionId]).toBeUndefined();

      // Check confirmed damage is displayed
      const damage = store.getPlayerDamage(targetId);
      expect(damage).toEqual({
        damage: actualDamage,
        timestamp: expect.any(Number),
        id: expect.any(String),
        attackerId,
        isConfirmed: true,
      });

      // Check health is updated
      const health = store.getPlayerHealth(targetId);
      expect(health.current).toBe(newHealth);
    });

    test('should prioritize confirmed damage over optimistic damage', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 2;
      const actualDamage = 1;
      const newHealth = 27;

      // Apply optimistic damage
      store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Apply confirmed damage (without transaction ID - different attack)
      store.applyDamageAndUpdateHealth(attackerId, targetId, actualDamage, newHealth);

      // Confirmed damage should take priority
      const damage = store.getPlayerDamage(targetId);
      expect(damage.damage).toBe(actualDamage);
      expect(damage.isConfirmed).toBe(true);
      expect(damage.isOptimistic).toBeUndefined();
    });
  });

  describe('Server Verification - Rollback', () => {
    test('should rollback optimistic damage when server rejects', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 2;

      // Apply optimistic damage
      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Verify optimistic damage is applied
      expect(store.getOptimisticDamage(targetId)).toBeDefined();
      expect(store.getPendingVerifications()[transactionId]).toBeDefined();

      // Simulate server rejection
      store.rollbackOptimisticDamage(transactionId, 'Attack blocked by server');

      // Check optimistic damage is removed
      const optimisticDamage = store.getOptimisticDamage(targetId);
      expect(optimisticDamage).toBeNull();

      // Check pending verification is removed
      const pendingVerifications = store.getPendingVerifications();
      expect(pendingVerifications[transactionId]).toBeUndefined();

      // Check no damage is displayed
      const damage = store.getPlayerDamage(targetId);
      expect(damage).toBeNull();
    });

    test('should handle rollback of unknown transaction gracefully', () => {
      const unknownTransactionId = 'unknown-txn-123';

      // Should not throw error
      expect(() => {
        store.rollbackOptimisticDamage(unknownTransactionId, 'Unknown transaction');
      }).not.toThrow();

      // State should remain unchanged
      expect(store.getOptimisticDamage('anyPlayer')).toBeNull();
      expect(Object.keys(store.getPendingVerifications())).toHaveLength(0);
    });
  });

  describe('Cleanup and Expiration', () => {
    test('should auto-rollback expired optimistic damage', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 2;

      // Apply optimistic damage
      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Mock time to be 6 seconds later (past the 5-second timeout)
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 6000);

      // Run cleanup
      store.cleanupExpiredStates();

      // Check optimistic damage is auto-rolled back
      expect(store.getOptimisticDamage(targetId)).toBeNull();
      expect(store.getPendingVerifications()[transactionId]).toBeUndefined();

      // Restore Date.now
      Date.now = originalNow;
    });

    test('should clear optimistic damage when clearing damage display', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 2;

      // Apply optimistic damage
      store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      // Clear damage display
      store.clearDamageDisplay(targetId);

      // Both confirmed and optimistic damage should be cleared
      expect(store.getPlayerDamage(targetId)).toBeNull();
      expect(store.getOptimisticDamage(targetId)).toBeNull();
    });
  });

  describe('Multiple Optimistic Attacks', () => {
    test('should handle multiple pending optimistic attacks', () => {
      const attackerId = 'attacker1';
      const target1 = 'target1';
      const target2 = 'target2';

      // Apply optimistic damage to multiple targets
      const txn1 = store.applyOptimisticDamage(attackerId, target1, 2);
      const txn2 = store.applyOptimisticDamage(attackerId, target2, 3);

      // Both should be tracked
      expect(store.getOptimisticDamage(target1)).toBeDefined();
      expect(store.getOptimisticDamage(target2)).toBeDefined();
      
      const pendingVerifications = store.getPendingVerifications();
      expect(pendingVerifications[txn1]).toBeDefined();
      expect(pendingVerifications[txn2]).toBeDefined();

      // Confirm one, rollback the other
      store.applyDamageAndUpdateHealth(attackerId, target1, 2, 25, 30, txn1);
      store.rollbackOptimisticDamage(txn2, 'Blocked');

      // Check final state
      expect(store.getPlayerDamage(target1).isConfirmed).toBe(true);
      expect(store.getPlayerDamage(target2)).toBeNull();
      expect(Object.keys(store.getPendingVerifications())).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero damage optimistic attacks', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = 0;

      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      expect(store.getOptimisticDamage(targetId).damage).toBe(0);
      expect(store.getPendingVerifications()[transactionId]).toBeDefined();
    });

    test('should handle negative damage gracefully', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const estimatedDamage = -1;

      const transactionId = store.applyOptimisticDamage(attackerId, targetId, estimatedDamage);

      expect(store.getOptimisticDamage(targetId).damage).toBe(-1);
      expect(store.getPendingVerifications()[transactionId]).toBeDefined();
    });
  });

  describe('Server Optimistic Damage', () => {
    test('should apply server optimistic damage immediately', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const damage = 3;
      const transactionId = 'server-txn-123';

      // Apply server optimistic damage
      store.applyServerOptimisticDamage(attackerId, targetId, damage, transactionId);

      // Check damage is displayed immediately
      const damageToRender = store.getPlayerDamage(targetId);
      expect(damageToRender).toBeDefined();
      expect(damageToRender.damage).toBe(damage);
      expect(damageToRender.isOptimistic).toBe(true);
      expect(damageToRender.transactionId).toBe(transactionId);
      expect(damageToRender.attackerId).toBe(attackerId);
    });

    test('should not update health for server optimistic damage', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const damage = 3;
      const transactionId = 'server-txn-123';

      // Set initial health
      store.setPlayerHealth(targetId, 20);
      const initialHealth = store.getPlayerHealth(targetId);

      // Apply server optimistic damage
      store.applyServerOptimisticDamage(attackerId, targetId, damage, transactionId);

      // Health should remain unchanged
      const currentHealth = store.getPlayerHealth(targetId);
      expect(currentHealth.current).toBe(initialHealth.current);
    });

    test('should confirm server optimistic damage with health update', () => {
      const attackerId = 'attacker1';
      const targetId = 'target1';
      const optimisticDamage = 2;
      const actualDamage = 3;
      const newHealth = 17;
      const transactionId = 'server-txn-123';

      // Apply server optimistic damage
      store.applyServerOptimisticDamage(attackerId, targetId, optimisticDamage, transactionId);

      // Verify optimistic damage is shown
      expect(store.getPlayerDamage(targetId).isOptimistic).toBe(true);

      // Confirm with actual damage and health
      store.applyDamageAndUpdateHealth(attackerId, targetId, actualDamage, newHealth, 30, transactionId);

      // Check damage is updated and confirmed
      const damage = store.getPlayerDamage(targetId);
      expect(damage.damage).toBe(actualDamage);
      expect(damage.isConfirmed).toBe(true);
      expect(damage.isOptimistic).toBeUndefined();

      // Check health is updated
      const health = store.getPlayerHealth(targetId);
      expect(health.current).toBe(newHealth);
    });
  });
});
