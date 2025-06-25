# BeriGame

A multiplayer 3D web-based game built with React Three Fiber and serverless backend architecture.

## Overview

BeriGame is a real-time multiplayer game featuring:
- 3D island environment with interactive elements
- Player-vs-player combat system with optimistic damage updates
- Inventory management with drag-and-drop functionality
- Resource harvesting (berry trees)
- Real-time chat and player interactions
- Serverless backend with WebSocket support

## Architecture

### Frontend
- **Framework**: React with Vite
- **3D Graphics**: React Three Fiber (@react-three/fiber)
- **State Management**: Zustand
- **Testing**: Vitest
- **Styling**: CSS

### Backend
- **Platform**: AWS Lambda (Serverless Framework)
- **Database**: DynamoDB
- **Real-time**: WebSocket API Gateway
- **Authentication**: JWT with Magic SDK
- **Testing**: Jest

## Getting Started

### Prerequisites
- Node.js 16.17+ (recommended for serverless-offline compatibility)
- AWS CLI configured (for deployment)
- Serverless Framework CLI

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/aj47/berigame.git
   cd berigame
   ```

2. **Install dependencies**
   ```bash
   # Root dependencies
   npm install
   
   # Frontend dependencies
   cd frontend
   npm install
   
   # Backend dependencies
   cd ../backend
   npm install
   ```

3. **Configure environment**
   ```bash
   # Backend configuration
   cd backend
   cp secrets.example.json secrets.json
   # Edit secrets.json with your configuration
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Backend
   cd backend
   serverless offline
   
   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

5. **Access the game**
   - Frontend: http://localhost:5173/
   - Backend API: http://localhost:3000/dev/

## Testing

### Frontend Tests
```bash
cd frontend
npm test          # Run tests
npm run test:ui   # Run tests with UI
```

### Backend Tests
```bash
cd backend
npm test          # Run tests
npm run test:watch  # Run tests in watch mode
```

## Game Features

### Combat System
- Real-time player-vs-player combat
- Optimistic damage updates for responsive gameplay
- Attack cooldowns and server-side validation
- Health management and respawn mechanics

### Inventory System
- 28-slot grid-based inventory
- Drag-and-drop item management
- Item stacking and consumption
- Ground item dropping and pickup

### Resource Harvesting
- Interactive berry trees
- Timed harvesting mechanics
- Multiple berry types with different effects

### Multiplayer Features
- Real-time player synchronization
- Chat system
- Player position validation
- Anti-cheat measures

## Deployment

### Backend Deployment
```bash
cd backend
serverless deploy
```

### Frontend Deployment
```bash
cd frontend
npm run build
# Deploy dist/ folder to your hosting service
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions, please use the GitHub Issues page.
