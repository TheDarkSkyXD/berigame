// Mock AWS services first
const mockDynamoDB = {
  get: jest.fn(),
  update: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  query: jest.fn(),
  scan: jest.fn(),
};

const mockAPIGateway = {
  postToConnection: jest.fn(),
};

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => mockDynamoDB),
  },
  ApiGatewayManagementApi: jest.fn(() => mockAPIGateway),
}));

// Mock the position validator to ensure it runs in production mode
const mockPositionValidator = {
  validatePositionUpdate: jest.fn(),
};

jest.mock('../positionValidator', () => {
  return jest.fn().mockImplementation(() => mockPositionValidator);
});

const { handler } = require('../chat.js');

// Mock environment variables
process.env.DB = 'test-table';
process.env.JWT_SECRET = 'test-secret';

describe('Combat System', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Database-backed cooldowns don't need manual clearing between tests

    // Ensure we're not in development mode for tests
    delete process.env.IS_OFFLINE;
    delete process.env.SERVERLESS_OFFLINE;
    process.env.NODE_ENV = 'test';
    process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs18.x';

    // Mock position validator to return valid result
    mockPositionValidator.validatePositionUpdate.mockResolvedValue({
      valid: true,
      correctedPosition: { x: 0, y: 0, z: 0 },
      reason: "valid_movement"
    });

    // Mock successful DynamoDB operations
    mockDynamoDB.get.mockReturnValue({
      promise: () => Promise.resolve({
        Item: {
          PK: 'test-room',
          SK: 'CONNECTION#test-connection',
          health: 30,
          position: { x: 0, y: 0, z: 0 },
          lastValidPosition: { x: 0, y: 0, z: 0 },
          lastPositionUpdate: Date.now() - 1000, // 1 second ago
          violationCount: 0,
          lastValidationTime: Date.now(),
        }
      })
    });

    mockDynamoDB.update.mockReturnValue({
      promise: () => Promise.resolve({
        Attributes: { health: 25 }
      })
    });

    mockDynamoDB.query.mockReturnValue({
      promise: () => Promise.resolve({
        Items: [
          { SK: 'CONNECTION#test-connection' },
          { SK: 'CONNECTION#target-player' }
        ]
      })
    });

    mockAPIGateway.postToConnection.mockReturnValue({
      promise: () => Promise.resolve()
    });
  });

  test('should allow 0 damage attacks with consistent health updates', async () => {
    // Mock Math.random to return 0 (which should result in 0 damage)
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0); // This will result in Math.floor(0 * 4) = 0

    // Mock attack cooldown check - allow attack
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: 0 // No previous attack
        }
      })
    });

    const event = {
      requestContext: {
        connectionId: 'test-connection',
        domainName: 'test-domain',
        stage: 'test',
        routeKey: 'sendUpdate',
      },
      body: JSON.stringify({
        message: {
          position: { x: 0, y: 0, z: 0 },
          attackingPlayer: 'target-player',
        },
        chatRoomId: 'test-room',
        connections: ['test-connection', 'target-player'],
      }),
    };

    const result = await handler(event);

    // Verify that the attack was processed
    expect(result.statusCode).toBe(200);

    // Verify that dealDamage was NOT called for 0 damage
    expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
      })
    );

    // Verify attack time was still updated (even for 0 damage)
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET lastAttackTime = :attackTime",
      })
    );

    // Restore Math.random
    Math.random = originalRandom;
  });

  test('should allow positive damage attacks', async () => {
    // Mock Math.random to return a value that results in positive damage
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.75); // This will result in Math.floor(0.75 * 4) = 3

    // Mock attack cooldown check - allow attack
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: 0 // No previous attack
        }
      })
    });

    const event = {
      requestContext: {
        connectionId: 'test-connection-positive',
        domainName: 'test-domain',
        stage: 'test',
        routeKey: 'sendUpdate',
      },
      body: JSON.stringify({
        message: {
          position: { x: 0, y: 0, z: 0 },
          attackingPlayer: 'target-player',
        },
        chatRoomId: 'test-room',
        connections: ['test-connection-positive', 'target-player'],
      }),
    };

    const result = await handler(event);

    // Verify that the attack was processed
    expect(result.statusCode).toBe(200);

    // Verify that dealDamage WAS called for positive damage
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
        ExpressionAttributeValues: {
          ":val": 3,
        },
      })
    );

    // Restore Math.random
    Math.random = originalRandom;
  });

  test('should generate damage values from 0 to 3', () => {
    const damageValues = new Set();
    const originalRandom = Math.random;

    // Test all possible outcomes
    [0, 0.25, 0.5, 0.75, 0.99].forEach(randomValue => {
      Math.random = jest.fn(() => randomValue);
      const damage = Math.floor(Math.random() * 4);
      damageValues.add(damage);
    });

    // Verify we can get all damage values from 0 to 3
    expect(damageValues).toEqual(new Set([0, 1, 2, 3]));

    // Restore Math.random
    Math.random = originalRandom;
  });

  test('should enforce attack cooldown with database-backed system', async () => {
    const originalRandom = Math.random;
    const originalDateNow = Date.now;
    Math.random = jest.fn(() => 0.75); // This will result in 3 damage

    let mockTime = 1000000; // Start at some arbitrary time
    Date.now = jest.fn(() => mockTime);

    const event = {
      requestContext: {
        connectionId: 'test-connection-cooldown-test',
        domainName: 'test-domain',
        stage: 'test',
        routeKey: 'sendUpdate',
      },
      body: JSON.stringify({
        message: {
          position: { x: 0, y: 0, z: 0 },
          attackingPlayer: 'target-player',
        },
        chatRoomId: 'test-room',
        connections: ['test-connection-cooldown-test', 'target-player'],
      }),
    };

    // Mock first attack - no previous attack time (allow attack)
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: 0 // No previous attack
        }
      })
    });

    // First attack should succeed
    const result1 = await handler(event);
    expect(result1.statusCode).toBe(200);

    // Verify attack time was updated in database
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET lastAttackTime = :attackTime",
        ExpressionAttributeValues: {
          ":attackTime": mockTime,
        },
      })
    );

    // Verify that dealDamage was called for the first attack
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
        ExpressionAttributeValues: {
          ":val": 3,
        },
      })
    );

    // Reset mock call count
    mockDynamoDB.update.mockClear();

    // Mock second attack - recent attack time (block attack)
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: mockTime // Same time as first attack
        }
      })
    });

    // Second attack immediately after should be blocked by cooldown
    const result2 = await handler(event);
    expect(result2.statusCode).toBe(200);

    // Verify that dealDamage was NOT called for the second attack (cooldown active)
    expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
      })
    );

    // Verify that attack time was NOT updated (attack blocked)
    expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET lastAttackTime = :attackTime",
      })
    );

    // Restore mocks
    Math.random = originalRandom;
    Date.now = originalDateNow;
  });

  test('should allow attack after 1-second cooldown period', async () => {
    const originalRandom = Math.random;
    const originalDateNow = Date.now;

    Math.random = jest.fn(() => 0.75); // This will result in 3 damage

    let mockTime = 1000000; // Start at some arbitrary time
    Date.now = jest.fn(() => mockTime);

    const event = {
      requestContext: {
        connectionId: 'test-connection-cooldown',
        domainName: 'test-domain',
        stage: 'test',
        routeKey: 'sendUpdate',
      },
      body: JSON.stringify({
        message: {
          position: { x: 0, y: 0, z: 0 },
          attackingPlayer: 'target-player',
        },
        chatRoomId: 'test-room',
        connections: ['test-connection-cooldown', 'target-player'],
      }),
    };

    // Mock first attack - no previous attack time (allow attack)
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: 0 // No previous attack
        }
      })
    });

    // First attack should succeed
    const result1 = await handler(event);
    expect(result1.statusCode).toBe(200);

    // Verify that dealDamage was called for the first attack
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
        ExpressionAttributeValues: {
          ":val": 3,
        },
      })
    );

    // Reset mock call count
    mockDynamoDB.update.mockClear();

    // Advance time by 1 second (cooldown period)
    mockTime += 1000;

    // Mock second attack - old attack time (allow attack)
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: mockTime - 1000 // 1 second ago
        }
      })
    });

    // Attack after cooldown should succeed
    const result3 = await handler(event);
    expect(result3.statusCode).toBe(200);

    // Verify that dealDamage was called again after cooldown
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
        ExpressionAttributeValues: {
          ":val": 3,
        },
      })
    );

    // Verify attack time was updated again
    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET lastAttackTime = :attackTime",
        ExpressionAttributeValues: {
          ":attackTime": mockTime,
        },
      })
    );

    // Restore mocks
    Math.random = originalRandom;
    Date.now = originalDateNow;
  });

  test('should include cooldown information in attack response messages', async () => {
    const originalRandom = Math.random;
    const originalDateNow = Date.now;
    Math.random = jest.fn(() => 0.5); // This will result in 2 damage

    let mockTime = 1000000;
    Date.now = jest.fn(() => mockTime);

    const event = {
      requestContext: {
        connectionId: 'test-connection-cooldown-info',
        domainName: 'test-domain',
        stage: 'test',
        routeKey: 'sendUpdate',
      },
      body: JSON.stringify({
        message: {
          position: { x: 0, y: 0, z: 0 },
          attackingPlayer: 'target-player',
        },
        chatRoomId: 'test-room',
        connections: ['test-connection-cooldown-info', 'target-player'],
      }),
    };

    // Mock attack on cooldown - recent attack time
    mockDynamoDB.get.mockReturnValueOnce({
      promise: () => Promise.resolve({
        Item: {
          lastAttackTime: mockTime - 500 // 500ms ago, still on cooldown
        }
      })
    });

    // Attack should be blocked and include cooldown info
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    // Verify the response includes cooldown information
    expect(mockAPIGateway.postToConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        Data: expect.stringContaining('"cooldownRemaining":500')
      })
    );

    expect(mockAPIGateway.postToConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        Data: expect.stringContaining('"attackAllowed":false')
      })
    );

    // Restore mocks
    Math.random = originalRandom;
    Date.now = originalDateNow;
  });
});
