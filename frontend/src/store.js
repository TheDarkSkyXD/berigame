import { create } from "zustand";

// Log every time state is changed
// usage: create(log((set) => ...
const log = (config) => (set, get, api) =>
  config(
    (args) => {
      console.log("  applying", args);
      set(args);
      console.log("  new state", get());
    },
    get,
    api
  );

export const useChatStore = create((set) => ({
  chatMessages: [],
  justSentMessage: null,
  focusedChat: false,
  setFocusedChat: (isFocused) =>
    set((state) => ({
      focusedChat: isFocused,
    })),
  setJustSentMessage: (message) =>
    set((state) => ({
      justSentMessage: message,
    })),
  addChatMessage: (newChatMessage) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, newChatMessage],
    })),
}));

export const useWebsocketStore = create((set) => ({
  websocketConnection: null,
  allConnections: [],
  setWebSocket: (ws) => set({ websocketConnection: ws }),
  setAllConnections: (connections) =>
    set((state) => ({
      allConnections: [...connections],
    })),
}));

export const useOtherUsersStore = create((set) => ({
  userPositions: {},
  damageToRender: {},
  playerHealths: {},
  removeDamageToRender: (connectionId) =>
    set((state) => ({
      damageToRender: {
        ...state.damageToRender,
        [connectionId]: null,
      },
    })),
  addDamageToRender: (newData) =>
    set((state) => ({
      damageToRender: {
        ...state.damageToRender,
        [newData.receivingPlayer]: state.damageToRender[newData.receivingPlayer]
          ? state.damageToRender[newData.receivingPlayer] + newData.damage
          : newData.damage,
      },
    })),
  setPlayerHealth: (playerId, health) =>
    set((state) => ({
      playerHealths: {
        ...state.playerHealths,
        [playerId]: health,
      },
    })),
  setUserPositions: (newUserPositions) =>
    set({ userPositions: { ...newUserPositions } }),
  setUserPosition: (newData) =>
    set((state) => ({
      userPositions: { ...state.userPositions, [newData.userId]: newData },
    })),
}));

export const useUserStateStore = create((set) => ({
  userConnectionId: null,
  userFollowing: null,
  userAttacking: null,
  isDead: false,
  isRespawning: false,
  health: 30,
  maxHealth: 30,
  setUserConnectionId: (id) => set({ userConnectionId: id }),
  setUserFollowing: (newObject) => set({ userFollowing: newObject }),
  setUserAttacking: (newObject) => set({ userAttacking: newObject }),
  setIsDead: (isDead) => set({ isDead }),
  setIsRespawning: (isRespawning) => set({ isRespawning }),
  setHealth: (health) => set({ health }),
  setMaxHealth: (maxHealth) => set({ maxHealth }),
}));

export const useUserInputStore = create((set) => ({
  clickedPointOnLand: null,
  clickedOtherObject: null,
  setClickedPointOnLand: (newPosition) =>
    set({ clickedPointOnLand: newPosition, clickedOtherObject: null }),
  setClickedOtherObject: (newObject) =>
    set({ clickedOtherObject: newObject, clickedPointOnLand: null }),
}));

export const useInventoryStore = create((set) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      // Check if item already exists and can be stacked
      const existingItemIndex = state.items.findIndex(
        (existingItem) =>
          existingItem.type === item.type &&
          existingItem.subType === item.subType
      );

      if (existingItemIndex !== -1 && item.quantity) {
        // Stack with existing item
        const updatedItems = [...state.items];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: (updatedItems[existingItemIndex].quantity || 1) + (item.quantity || 1)
        };
        return { items: updatedItems };
      } else {
        // Add as new item
        return {
          items: [...state.items, { ...item, id: Date.now() + Math.random() }],
        };
      }
    }),
  removeItem: (itemId) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== itemId),
    })),
  getItemCount: (itemType, subType) => (state) =>
    state.items
      .filter((item) => item.type === itemType && (!subType || item.subType === subType))
      .reduce((total, item) => total + (item.quantity || 1), 0),
}));

export const useHarvestStore = create((set, get) => ({
  activeHarvests: {}, // treeId -> { startTime, duration, playerId }
  treeStates: {}, // treeId -> { lastHarvested, cooldownUntil, isHarvestable }
  startHarvest: (treeId, playerId, duration) =>
    set((state) => ({
      activeHarvests: {
        ...state.activeHarvests,
        [treeId]: {
          startTime: Date.now(),
          duration: duration * 1000, // convert to milliseconds
          playerId,
        },
      },
    })),
  completeHarvest: (treeId) =>
    set((state) => {
      const newActiveHarvests = { ...state.activeHarvests };
      delete newActiveHarvests[treeId];
      return {
        activeHarvests: newActiveHarvests,
        treeStates: {
          ...state.treeStates,
          [treeId]: {
            lastHarvested: Date.now(),
            cooldownUntil: Date.now() + 30000, // 30 second cooldown
            isHarvestable: false,
          },
        },
      };
    }),
  cancelHarvest: (treeId) =>
    set((state) => {
      const newActiveHarvests = { ...state.activeHarvests };
      delete newActiveHarvests[treeId];
      return { activeHarvests: newActiveHarvests };
    }),
  updateTreeCooldown: (treeId) =>
    set((state) => {
      const treeState = state.treeStates[treeId];
      if (treeState && Date.now() > treeState.cooldownUntil) {
        return {
          treeStates: {
            ...state.treeStates,
            [treeId]: {
              ...treeState,
              isHarvestable: true,
            },
          },
        };
      }
      return state;
    }),
  getHarvestProgress: (treeId) => (state) => {
    const harvest = state.activeHarvests[treeId];
    if (!harvest) return null;
    const elapsed = Date.now() - harvest.startTime;
    const progress = Math.min(elapsed / harvest.duration, 1);
    return { progress, isComplete: progress >= 1 };
  },
  isTreeHarvestable: (treeId) => (state) => {
    const treeState = state.treeStates[treeId];
    const activeHarvest = state.activeHarvests[treeId];

    // Tree is not harvestable if there's an active harvest
    if (activeHarvest) return false;

    // If no tree state exists, it's harvestable by default
    if (!treeState) return true;

    // Check if cooldown has expired
    return treeState.isHarvestable || Date.now() > treeState.cooldownUntil;
  },
}));

export const useLoadingStore = create((set, get) => ({
  isLoading: true,
  loadingProgress: 0,
  loadingMessage: "Initializing world...",
  assetsToLoad: [
    "native-woman.glb",
    "tree.glb",
    "giant.glb"
  ],
  loadedAssets: [],
  startTime: Date.now(),

  setLoading: (isLoading) => set({ isLoading }),

  setLoadingMessage: (message) => set({ loadingMessage: message }),

  addLoadedAsset: (assetUrl) => set((state) => {
    // Avoid duplicate assets
    if (state.loadedAssets.includes(assetUrl)) return state;

    console.log(`Loading asset: ${assetUrl}`);
    const newLoadedAssets = [...state.loadedAssets, assetUrl];
    const progress = newLoadedAssets.length / state.assetsToLoad.length;

    let message = "Loading world assets...";
    if (progress >= 0.3) message = "Loading characters...";
    if (progress >= 0.6) message = "Loading environment...";
    if (progress >= 0.9) message = "Almost ready...";
    if (progress >= 1) {
      message = "Welcome to BeriGame!";
      console.log("All assets loaded, hiding loading screen");

      // Ensure minimum loading time of 2 seconds for better UX
      const elapsedTime = Date.now() - get().startTime;
      const minLoadingTime = 2000;
      const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

      setTimeout(() => {
        set({ isLoading: false });
      }, remainingTime + 500); // Extra 500ms to show "Welcome" message
    }

    console.log(`Loading progress: ${Math.round(progress * 100)}% (${newLoadedAssets.length}/${state.assetsToLoad.length})`);

    return {
      loadedAssets: newLoadedAssets,
      loadingProgress: Math.min(progress, 1),
      loadingMessage: message,
      isLoading: progress < 1
    };
  }),

  resetLoading: () => set({
    isLoading: true,
    loadingProgress: 0,
    loadingMessage: "Initializing world...",
    loadedAssets: [],
    startTime: Date.now()
  })
}));
