const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

// DynamoDB timing utility
const logDynamoDBCall = (operation, params) => {
  const startTime = Date.now();
  const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  console.log(`🔵 [${operationId}] Starting DynamoDB ${operation}`, {
    operation,
    table: params.TableName,
    key: params.Key || 'N/A',
    timestamp: new Date().toISOString()
  });

  return {
    operationId,
    startTime,
    finish: () => {
      const duration = Date.now() - startTime;
      console.log(`🟢 [${operationId}] Completed DynamoDB ${operation} in ${duration}ms`, {
        operation,
        duration,
        timestamp: new Date().toISOString()
      });

      if (duration > 500) {
        console.warn(`🐌 [${operationId}] Slow DynamoDB operation: ${operation} took ${duration}ms`);
      }

      return duration;
    }
  };
};

// Game world constants
const WORLD_BOUNDS = {
  MIN_X: -25,
  MAX_X: 25,
  MIN_Z: -25,
  MAX_Z: 25,
  MIN_Y: -1, // Allow slight underground for terrain variations
  MAX_Y: 10  // Reasonable height limit
};

// Movement constraints
const MAX_MOVEMENT_SPEED = 2.5; // units per second (slightly higher than normal for lag tolerance)
const MIN_UPDATE_INTERVAL = 100; // milliseconds between position updates
const MAX_UPDATES_PER_SECOND = 10;
const MAX_TELEPORT_DISTANCE = 5; // Maximum instant movement allowed
const SPAWN_LOCATION = { x: 0, y: 0, z: 0 };

// Violation tracking
const MAX_VIOLATIONS_PER_MINUTE = 5;
const VIOLATION_BAN_DURATION = 60000; // 1 minute ban

class PositionValidator {
  constructor(tableName) {
    this.tableName = tableName;
  }

  /**
   * Validate a position update from a player
   * @param {string} connectionId - Player's connection ID
   * @param {string} chatRoomId - Chat room ID
   * @param {Object} newPosition - New position {x, y, z}
   * @param {number} timestamp - Current timestamp
   * @returns {Object} Validation result
   */
  async validatePositionUpdate(connectionId, chatRoomId, newPosition, timestamp) {
    const startTime = Date.now();

    // Fast validation for development environment
    // Check multiple possible environment indicators for serverless offline
    const isOffline = process.env.IS_OFFLINE ||
                     process.env.NODE_ENV === 'development' ||
                     process.env.SERVERLESS_OFFLINE ||
                     process.env.AWS_EXECUTION_ENV === undefined;

    console.log(`🔍 Environment check: IS_OFFLINE=${process.env.IS_OFFLINE}, NODE_ENV=${process.env.NODE_ENV}, AWS_EXECUTION_ENV=${process.env.AWS_EXECUTION_ENV}, isOffline=${isOffline}`);

    if (isOffline) {
      console.log(`🚀 [DEV] Fast validation for ${connectionId}`);

      // Only do basic boundary checks in development
      if (!this.isWithinWorldBounds(newPosition)) {
        console.log(`❌ [DEV] Boundary violation detected`);
        return {
          valid: false,
          correctedPosition: this.clampToWorldBounds(newPosition),
          reason: "boundary_violation"
        };
      }

      // Skip database operations in development for speed
      const validationTime = Date.now() - startTime;
      console.log(`⚡ [DEV] Fast validation completed in ${validationTime}ms`);

      return {
        valid: true,
        correctedPosition: newPosition,
        reason: "valid_movement_dev"
      };
    }

    // Full validation for production
    try {
      // Get player's current state from database
      const playerState = await this.getPlayerState(connectionId, chatRoomId);

      if (!playerState) {
        // New player - initialize with spawn location
        await this.initializePlayerPosition(connectionId, chatRoomId, SPAWN_LOCATION, timestamp);
        return {
          valid: true,
          correctedPosition: SPAWN_LOCATION,
          reason: "new_player_initialized"
        };
      }

      // Check if player is currently banned
      if (this.isPlayerBanned(playerState, timestamp)) {
        return {
          valid: false,
          correctedPosition: playerState.lastValidPosition,
          reason: "player_banned",
          banTimeRemaining: playerState.banUntil - timestamp
        };
      }

      // Validate world boundaries
      if (!this.isWithinWorldBounds(newPosition)) {
        await this.recordViolation(connectionId, chatRoomId, "boundary_violation", timestamp, {
          attemptedPosition: newPosition,
          correctedPosition: this.clampToWorldBounds(newPosition)
        });
        return {
          valid: false,
          correctedPosition: this.clampToWorldBounds(newPosition),
          reason: "boundary_violation"
        };
      }

      // Check rate limiting
      const rateLimitResult = this.checkRateLimit(playerState, timestamp);
      if (!rateLimitResult.valid) {
        return {
          valid: false,
          correctedPosition: playerState.lastValidPosition,
          reason: "rate_limit_exceeded"
        };
      }

      // Validate movement speed and distance
      const movementResult = this.validateMovement(playerState, newPosition, timestamp);
      if (!movementResult.valid) {
        const distance = this.calculateDistance(playerState.lastValidPosition, newPosition);
        const timeDelta = (timestamp - playerState.lastPositionUpdate) / 1000;
        const speed = distance / timeDelta;

        await this.recordViolation(connectionId, chatRoomId, movementResult.reason, timestamp, {
          attemptedPosition: newPosition,
          distance: distance,
          timeDelta: timeDelta,
          calculatedSpeed: speed,
          maxAllowedSpeed: MAX_MOVEMENT_SPEED
        });
        return {
          valid: false,
          correctedPosition: playerState.lastValidPosition,
          reason: movementResult.reason
        };
      }

      // Position is valid - update player state (pass existing state to avoid extra DB call)
      await this.updatePlayerPosition(connectionId, chatRoomId, newPosition, timestamp, playerState);

      // Log performance metrics
      const validationTime = Date.now() - startTime;
      this.logPerformanceMetrics(validationTime, true);

      return {
        valid: true,
        correctedPosition: newPosition,
        reason: "valid_movement"
      };

    } catch (error) {
      console.error("Position validation error:", error);
      const validationTime = Date.now() - startTime;
      this.logPerformanceMetrics(validationTime, false);

      return {
        valid: false,
        correctedPosition: SPAWN_LOCATION,
        reason: "validation_error"
      };
    }
  }

  /**
   * Log performance metrics for monitoring (optimized)
   */
  logPerformanceMetrics(validationTime, success) {
    // Only log if validation takes too long to avoid excessive logging
    if (validationTime > 500) {
      console.warn(`Position validation took ${validationTime}ms - consider optimization`);
    }

    // In production, you could send metrics to CloudWatch/DataDog here
    // For now, we'll skip detailed logging to improve performance
  }

  /**
   * Check if position is within world boundaries
   */
  isWithinWorldBounds(position) {
    return position.x >= WORLD_BOUNDS.MIN_X && position.x <= WORLD_BOUNDS.MAX_X &&
           position.z >= WORLD_BOUNDS.MIN_Z && position.z <= WORLD_BOUNDS.MAX_Z &&
           position.y >= WORLD_BOUNDS.MIN_Y && position.y <= WORLD_BOUNDS.MAX_Y;
  }

  /**
   * Clamp position to world boundaries
   */
  clampToWorldBounds(position) {
    return {
      x: Math.max(WORLD_BOUNDS.MIN_X, Math.min(WORLD_BOUNDS.MAX_X, position.x)),
      y: Math.max(WORLD_BOUNDS.MIN_Y, Math.min(WORLD_BOUNDS.MAX_Y, position.y)),
      z: Math.max(WORLD_BOUNDS.MIN_Z, Math.min(WORLD_BOUNDS.MAX_Z, position.z))
    };
  }

  /**
   * Validate movement speed and distance
   */
  validateMovement(playerState, newPosition, timestamp) {
    const lastPosition = playerState.lastValidPosition;
    const timeDelta = (timestamp - playerState.lastPositionUpdate) / 1000; // Convert to seconds
    
    if (timeDelta <= 0) {
      return { valid: false, reason: "invalid_timestamp" };
    }

    // Calculate distance moved
    const distance = this.calculateDistance(lastPosition, newPosition);
    
    // Check for teleportation (instant large movement)
    if (distance > MAX_TELEPORT_DISTANCE && timeDelta < 0.5) {
      return { valid: false, reason: "teleportation_detected" };
    }

    // Check movement speed
    const speed = distance / timeDelta;
    if (speed > MAX_MOVEMENT_SPEED) {
      return { valid: false, reason: "speed_violation" };
    }

    return { valid: true };
  }

  /**
   * Check rate limiting for position updates (optimized)
   */
  checkRateLimit(playerState, timestamp) {
    const timeSinceLastUpdate = timestamp - playerState.lastPositionUpdate;

    if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL) {
      return { valid: false, reason: "update_too_frequent" };
    }

    // Simplified rate limiting - just check time since last update
    // This is more performant than filtering through position history
    const updatesPerSecond = 1000 / timeSinceLastUpdate;

    if (updatesPerSecond > MAX_UPDATES_PER_SECOND) {
      return { valid: false, reason: "too_many_updates" };
    }

    return { valid: true };
  }

  /**
   * Calculate 3D distance between two positions
   */
  calculateDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Check if player is currently banned
   */
  isPlayerBanned(playerState, timestamp) {
    return playerState.banUntil && playerState.banUntil > timestamp;
  }

  /**
   * Get player state from database
   */
  async getPlayerState(connectionId, chatRoomId) {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: chatRoomId,
          SK: "CONNECTION#" + connectionId
        }
      };

      const playerStateTimer = logDynamoDBCall('get', params);
      const result = await dynamodb.get(params).promise();
      playerStateTimer.finish();
      return result.Item;
    } catch (error) {
      console.error("Error getting player state:", error);
      return null;
    }
  }

  /**
   * Initialize new player position
   */
  async initializePlayerPosition(connectionId, chatRoomId, position, timestamp) {
    const params = {
      TableName: this.tableName,
      Key: {
        PK: chatRoomId,
        SK: "CONNECTION#" + connectionId
      },
      UpdateExpression: `SET
        lastValidPosition = :pos,
        lastPositionUpdate = :timestamp,
        positionHistory = :history,
        violationCount = :zero,
        lastViolationTime = :zero,
        updateCount = :zero`,
      ExpressionAttributeValues: {
        ":pos": position,
        ":timestamp": timestamp,
        ":history": [{ position, timestamp }],
        ":zero": 0
      }
    };

    const initTimer = logDynamoDBCall('update', params);
    await dynamodb.update(params).promise();
    initTimer.finish();
  }

  /**
   * Update player position in database (optimized to avoid extra DB call)
   */
  async updatePlayerPosition(connectionId, chatRoomId, position, timestamp, existingPlayerState = null) {
    // Use existing player state if provided to avoid extra DB call
    const playerState = existingPlayerState || await this.getPlayerState(connectionId, chatRoomId);
    const positionHistory = playerState?.positionHistory || [];

    // Add new position to history
    positionHistory.push({ position, timestamp });

    // Keep only last 5 position history entries (reduced from 10 for performance)
    if (positionHistory.length > 5) {
      positionHistory.shift();
    }

    const params = {
      TableName: this.tableName,
      Key: {
        PK: chatRoomId,
        SK: "CONNECTION#" + connectionId
      },
      UpdateExpression: `SET
        lastValidPosition = :pos,
        lastPositionUpdate = :timestamp,
        positionHistory = :history,
        updateCount = updateCount + :one`,
      ExpressionAttributeValues: {
        ":pos": position,
        ":timestamp": timestamp,
        ":history": positionHistory,
        ":one": 1
      }
    };

    const positionTimer = logDynamoDBCall('update', params);
    await dynamodb.update(params).promise();
    positionTimer.finish();
  }

  /**
   * Record a violation with comprehensive logging
   */
  async recordViolation(connectionId, chatRoomId, violationType, timestamp, additionalData = {}) {
    // Note: getPlayerState already has timing logs
    const playerState = await this.getPlayerState(connectionId, chatRoomId);
    const violationCount = (playerState.violationCount || 0) + 1;

    // Check if player should be banned
    let banUntil = null;
    if (violationCount >= MAX_VIOLATIONS_PER_MINUTE) {
      banUntil = timestamp + VIOLATION_BAN_DURATION;
    }

    const params = {
      TableName: this.tableName,
      Key: {
        PK: chatRoomId,
        SK: "CONNECTION#" + connectionId
      },
      UpdateExpression: `SET
        violationCount = :count,
        lastViolationTime = :timestamp,
        lastViolationType = :type` + (banUntil ? ", banUntil = :banUntil" : ""),
      ExpressionAttributeValues: {
        ":count": violationCount,
        ":timestamp": timestamp,
        ":type": violationType,
        ...(banUntil && { ":banUntil": banUntil })
      }
    };

    const violationTimer = logDynamoDBCall('update', params);
    await dynamodb.update(params).promise();
    violationTimer.finish();

    // Comprehensive logging
    const logData = {
      timestamp: new Date(timestamp).toISOString(),
      connectionId,
      chatRoomId,
      violationType,
      violationCount,
      banned: !!banUntil,
      banDuration: banUntil ? VIOLATION_BAN_DURATION : null,
      playerPosition: additionalData.attemptedPosition,
      lastValidPosition: playerState.lastValidPosition,
      timeSinceLastUpdate: timestamp - playerState.lastPositionUpdate,
      ...additionalData
    };

    // Log violation in development only
    if (process.env.NODE_ENV === 'development') {
      console.log(`Position violation detected for ${connectionId}: ${violationType}`);
    }

    // Log ban if applied
    if (banUntil && process.env.NODE_ENV === 'development') {
      console.log(`Player ${connectionId} banned until ${new Date(banUntil).toISOString()} for repeated violations`);
    }

    // Log metrics for monitoring
    this.logMetrics(violationType, violationCount, !!banUntil);
  }

  /**
   * Log metrics for monitoring and analytics
   */
  logMetrics(violationType, violationCount, isBanned) {
    const metrics = {
      timestamp: new Date().toISOString(),
      metric: 'position_validation',
      violation_type: violationType,
      violation_count: violationCount,
      banned: isBanned,
      severity: this.getViolationSeverity(violationType)
    };

    // In production, this could send to CloudWatch, DataDog, etc.
    // Only log metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[METRICS]`, JSON.stringify(metrics));
    }
  }

  /**
   * Get violation severity for monitoring
   */
  getViolationSeverity(violationType) {
    const severityMap = {
      'boundary_violation': 'medium',
      'speed_violation': 'high',
      'teleportation_detected': 'critical',
      'rate_limit_exceeded': 'low',
      'invalid_timestamp': 'medium'
    };
    return severityMap[violationType] || 'unknown';
  }
}

module.exports = PositionValidator;
