/**
 * Centralized Item Definition System
 *
 * This file defines all items in the game with their properties and behaviors.
 * Items are identified by unique IDs and contain all necessary metadata.
 */

// Item categories
const ITEM_CATEGORIES = {
  CONSUMABLE: 'consumable',
  TOOL: 'tool',
  WEAPON: 'weapon',
  ARMOR: 'armor',
  MATERIAL: 'material',
  MISC: 'misc'
};

// Item rarities
const ITEM_RARITIES = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary'
};

// Base item definition structure
const createItemDefinition = ({
  id,
  name,
  description,
  category,
  rarity = ITEM_RARITIES.COMMON,
  icon,
  maxStackSize = 1,
  isStackable = false,
  isConsumable = false,
  consumeEffect = null,
  value = 0,
  weight = 0,
  metadata = {}
}) => ({
  id,
  name,
  description,
  category,
  rarity,
  icon,
  maxStackSize: isStackable ? maxStackSize : 1,
  isStackable,
  isConsumable,
  consumeEffect,
  value,
  weight,
  metadata
});

// Berry consume effects
const BERRY_EFFECTS = {
  BLUEBERRY: {
    healthRestore: 5,
    description: "Restores 5 health"
  },
  STRAWBERRY: {
    healthRestore: 3,
    description: "Restores 3 health"
  },
  GREENBERRY: {
    healthRestore: 2,
    description: "Restores 2 health"
  },
  GOLDBERRY: {
    healthRestore: 10,
    description: "Restores 10 health"
  }
};

// Item definitions
const ITEM_DEFINITIONS = {
  // Berries (Consumables)
  'berry_blueberry': createItemDefinition({
    id: 'berry_blueberry',
    name: 'Blueberry',
    description: 'A sweet blue berry that restores health.',
    category: ITEM_CATEGORIES.CONSUMABLE,
    rarity: ITEM_RARITIES.COMMON,
    icon: '/blueberry.svg',
    maxStackSize: 99,
    isStackable: true,
    isConsumable: true,
    consumeEffect: BERRY_EFFECTS.BLUEBERRY,
    value: 2,
    weight: 0.1
  }),

  'berry_strawberry': createItemDefinition({
    id: 'berry_strawberry',
    name: 'Strawberry',
    description: 'A red berry with moderate healing properties.',
    category: ITEM_CATEGORIES.CONSUMABLE,
    rarity: ITEM_RARITIES.COMMON,
    icon: '/strawberry.svg',
    maxStackSize: 99,
    isStackable: true,
    isConsumable: true,
    consumeEffect: BERRY_EFFECTS.STRAWBERRY,
    value: 3,
    weight: 0.1
  }),

  'berry_greenberry': createItemDefinition({
    id: 'berry_greenberry',
    name: 'Greenberry',
    description: 'A green berry with mild healing properties.',
    category: ITEM_CATEGORIES.CONSUMABLE,
    rarity: ITEM_RARITIES.COMMON,
    icon: '/greenberry.svg',
    maxStackSize: 99,
    isStackable: true,
    isConsumable: true,
    consumeEffect: BERRY_EFFECTS.GREENBERRY,
    value: 1,
    weight: 0.1
  }),

  'berry_goldberry': createItemDefinition({
    id: 'berry_goldberry',
    name: 'Goldberry',
    description: 'A rare golden berry with powerful healing properties.',
    category: ITEM_CATEGORIES.CONSUMABLE,
    rarity: ITEM_RARITIES.RARE,
    icon: '/goldberry.svg',
    maxStackSize: 99,
    isStackable: true,
    isConsumable: true,
    consumeEffect: BERRY_EFFECTS.GOLDBERRY,
    value: 10,
    weight: 0.1
  })

  // Future items can be added here:
  // 'tool_axe': createItemDefinition({ ... }),
  // 'weapon_sword': createItemDefinition({ ... }),
  // etc.
};

// Helper functions
const getItemDefinition = (itemId) => {
  return ITEM_DEFINITIONS[itemId] || null;
};

const isValidItemId = (itemId) => {
  return itemId in ITEM_DEFINITIONS;
};

const getItemsByCategory = (category) => {
  return Object.values(ITEM_DEFINITIONS).filter(item => item.category === category);
};

const getConsumableItems = () => {
  return Object.values(ITEM_DEFINITIONS).filter(item => item.isConsumable);
};

const getStackableItems = () => {
  return Object.values(ITEM_DEFINITIONS).filter(item => item.isStackable);
};

// Legacy berry type mapping for migration
const LEGACY_BERRY_MAPPING = {
  'blueberry': 'berry_blueberry',
  'strawberry': 'berry_strawberry',
  'greenberry': 'berry_greenberry',
  'goldberry': 'berry_goldberry'
};

const getLegacyBerryItemId = (legacyBerryType) => {
  return LEGACY_BERRY_MAPPING[legacyBerryType] || null;
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = {
    ITEM_CATEGORIES,
    ITEM_RARITIES,
    ITEM_DEFINITIONS,
    getItemDefinition,
    isValidItemId,
    getItemsByCategory,
    getConsumableItems,
    getStackableItems,
    LEGACY_BERRY_MAPPING,
    getLegacyBerryItemId
  };
} else {
  // ES modules (for frontend)
  if (typeof window !== 'undefined') {
    window.ItemDefinitions = {
      ITEM_CATEGORIES,
      ITEM_RARITIES,
      ITEM_DEFINITIONS,
      getItemDefinition,
      isValidItemId,
      getItemsByCategory,
      getConsumableItems,
      getStackableItems,
      LEGACY_BERRY_MAPPING,
      getLegacyBerryItemId
    };
  }
}
