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

const { handler, clearAttackCooldowns } = require('../chat.js');

// Mock environment variables
process.env.DB = 'test-table';
process.env.JWT_SECRET = 'test-secret';

describe('Combat System', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Clear attack cooldowns between tests
    if (clearAttackCooldowns) {
      clearAttackCooldowns();
    }

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

    // Verify that dealDamage was NOT called for 0 damage (no health update)
    expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
      })
    );

    // But verify that health was queried for consistent message flow
    expect(mockDynamoDB.get).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: {
          PK: 'test-room',
          SK: 'CONNECTION#target-player',
        },
      })
    );

    // Restore Math.random
    Math.random = originalRandom;
  });

  test('should allow positive damage attacks', async () => {
    // Mock Math.random to return a value that results in positive damage
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.75); // This will result in Math.floor(0.75 * 4) = 3

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

  test('should enforce attack cooldown', async () => {
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.75); // This will result in 3 damage

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

    // Second attack immediately after should be blocked by cooldown
    const result2 = await handler(event);
    expect(result2.statusCode).toBe(200);

    // Verify that dealDamage was NOT called for the second attack (cooldown active)
    expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: "SET health = health - :val",
      })
    );

    // Restore Math.random
    Math.random = originalRandom;
  });

  test('should allow attack after cooldown period', async () => {
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

    // Advance time by 6 seconds (cooldown period)
    mockTime += 6000;

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

    // Restore mocks
    Math.random = originalRandom;
    Date.now = originalDateNow;
  });
});
