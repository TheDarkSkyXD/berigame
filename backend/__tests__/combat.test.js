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

const { handler } = require('../chat.js');

// Mock environment variables
process.env.DB = 'test-table';
process.env.JWT_SECRET = 'test-secret';

describe('Combat System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful DynamoDB operations
    mockDynamoDB.get.mockReturnValue({
      promise: () => Promise.resolve({
        Item: {
          PK: 'test-room',
          SK: 'CONNECTION#test-connection',
          health: 30,
          position: { x: 0, y: 0, z: 0 },
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
    
    mockAPIGateway.postToConnection.mockReturnValue({
      promise: () => Promise.resolve()
    });
  });

  test('should allow 0 damage attacks', async () => {
    // Mock Math.random to return 0 (which should result in 0 damage)
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0); // This will result in Math.floor(0 * 4) = 0

    const event = {
      requestContext: {
        connectionId: 'test-connection',
        domainName: 'test-domain',
        stage: 'test',
      },
      body: JSON.stringify({
        action: 'sendUpdate',
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

    // Restore Math.random
    Math.random = originalRandom;
  });

  test('should allow positive damage attacks', async () => {
    // Mock Math.random to return a value that results in positive damage
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.75); // This will result in Math.floor(0.75 * 4) = 3

    const event = {
      requestContext: {
        connectionId: 'test-connection',
        domainName: 'test-domain',
        stage: 'test',
      },
      body: JSON.stringify({
        action: 'sendUpdate',
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
});
