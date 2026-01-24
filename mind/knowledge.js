/**
 * Knowledge Base Module
 * Static game knowledge for the bot's decision-making
 */

// Item name synonyms - maps common terms to actual item names
const itemSynonyms = {
    // Wood types
    'wood': 'oak_log',
    'logs': 'oak_log',
    'tree': 'oak_log',
    'trees': 'oak_log',
    'timber': 'oak_log',

    // Ores and minerals
    'diamonds': 'diamond',
    'iron': 'iron_ore',
    'gold': 'gold_ore',
    'coal': 'coal_ore',
    'copper': 'copper_ore',
    'emeralds': 'emerald',
    'redstone': 'redstone_ore',
    'lapis': 'lapis_ore',

    // Common items
    'pick': 'pickaxe',
    'axe': 'axe',
    'sword': 'sword',
    'shovel': 'shovel',
    'hoe': 'hoe',
    'stick': 'stick',
    'sticks': 'stick',
    'plank': 'planks',
    'planks': 'oak_planks',
    'table': 'crafting_table',
    'workbench': 'crafting_table',
    'bench': 'crafting_table',
    'furnace': 'furnace',
    'oven': 'furnace',

    // Food
    'food': 'bread',
    'bread': 'bread',
    'apple': 'apple',
    'meat': 'cooked_beef',
    'steak': 'cooked_beef',

    // Mobs
    'zombies': 'zombie',
    'skeletons': 'skeleton',
    'spiders': 'spider',
    'creepers': 'creeper',
    'endermen': 'enderman',
    'monsters': 'hostile',
    'mobs': 'hostile',
    'animals': 'passive',

    // Blocks
    'stone': 'stone',
    'cobble': 'cobblestone',
    'cobblestone': 'cobblestone',
    'dirt': 'dirt',
    'sand': 'sand',
    'gravel': 'gravel',
    'glass': 'glass',
};

// Action synonyms - maps common verbs to internal actions
const actionSynonyms = {
    // Mining/Gathering
    'get': 'mine',
    'mine': 'mine',
    'dig': 'mine',
    'gather': 'mine',
    'collect': 'mine',
    'find': 'mine',
    'bring': 'mine',
    'fetch': 'mine',
    'obtain': 'mine',
    'grab': 'mine',

    // Crafting
    'make': 'make',
    'craft': 'make',
    'create': 'make',
    'build': 'make',
    'construct': 'make',
    'forge': 'make',

    // Navigation
    'come': 'come',
    'follow': 'come',
    'here': 'come',
    'goto': 'go',
    'go': 'go',
    'move': 'go',
    'walk': 'go',
    'run': 'go',
    'travel': 'go',

    // Combat
    'kill': 'kill',
    'attack': 'kill',
    'fight': 'kill',
    'slay': 'kill',
    'hunt': 'kill',
    'destroy': 'kill',

    // Farming
    'farm': 'farm',
    'harvest': 'farm',
    'plant': 'farm',
    'grow': 'farm',

    // Control
    'stop': 'stop',
    'halt': 'stop',
    'cancel': 'stop',
    'wait': 'stop',
    'pause': 'stop',

    // Item management
    'drop': 'drop',
    'throw': 'drop',
    'toss': 'drop',
    'give': 'drop',
};

// Tool tier hierarchy
const toolTiers = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];

// What tool is needed for each material
const toolForMaterial = {
    'wooden': null,
    'stone': 'wooden_pickaxe',
    'iron': 'stone_pickaxe',
    'gold': 'iron_pickaxe',
    'diamond': 'iron_pickaxe',
    'netherite': 'diamond_pickaxe',
    'obsidian': 'diamond_pickaxe',
};

// Items that can be gathered (mined from world)
const gatherableItems = [
    'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
    'stone', 'cobblestone', 'dirt', 'sand', 'gravel', 'clay',
    'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore',
    'copper_ore', 'redstone_ore', 'lapis_ore',
    'wheat', 'carrots', 'potatoes', 'beetroots',
];

// Items that need to be crafted
const craftableItems = [
    'planks', 'stick', 'crafting_table', 'furnace', 'chest',
    'wooden_pickaxe', 'wooden_axe', 'wooden_sword', 'wooden_shovel', 'wooden_hoe',
    'stone_pickaxe', 'stone_axe', 'stone_sword', 'stone_shovel', 'stone_hoe',
    'iron_pickaxe', 'iron_axe', 'iron_sword', 'iron_shovel', 'iron_hoe',
    'diamond_pickaxe', 'diamond_axe', 'diamond_sword', 'diamond_shovel', 'diamond_hoe',
    'torch', 'ladder', 'fence', 'door', 'bed', 'bucket', 'bow', 'arrow',
    'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots',
    'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',
    'bread', 'golden_apple', 'golden_carrot',
];

// Default quantity for different actions
const defaultQuantities = {
    'mine': 64,
    'make': 1,
    'kill': 10,
    'farm': 64,
};

/**
 * Normalize an item name to its canonical form
 */
function normalizeItem(itemName) {
    if (!itemName) return null;

    const lower = itemName.toLowerCase().replace(/-/g, '_').trim();

    // Check synonyms first
    if (itemSynonyms[lower]) {
        return itemSynonyms[lower];
    }

    // Handle tool requests (e.g., "iron pick" -> "iron_pickaxe")
    const words = lower.split(/\s+/);
    if (words.length === 2) {
        const [material, tool] = words;
        if (toolTiers.includes(material) || ['iron', 'diamond', 'gold', 'stone', 'wooden'].includes(material)) {
            const toolType = itemSynonyms[tool] || tool;
            if (['pickaxe', 'axe', 'sword', 'shovel', 'hoe'].includes(toolType)) {
                const matPrefix = material === 'gold' ? 'golden' : material;
                return `${matPrefix}_${toolType}`;
            }
        }
    }

    // Return as-is with underscores
    return lower.replace(/\s+/g, '_');
}

/**
 * Normalize an action to its canonical form
 */
function normalizeAction(action) {
    if (!action) return null;
    const lower = action.toLowerCase().trim();
    return actionSynonyms[lower] || lower;
}

/**
 * Check if an item needs to be mined or crafted
 */
function isCraftable(itemName) {
    const normalized = normalizeItem(itemName);
    return craftableItems.includes(normalized) ||
        normalized.includes('pickaxe') ||
        normalized.includes('sword') ||
        normalized.includes('axe') ||
        normalized.includes('shovel') ||
        normalized.includes('hoe') ||
        normalized.includes('helmet') ||
        normalized.includes('chestplate') ||
        normalized.includes('leggings') ||
        normalized.includes('boots');
}

/**
 * Check if an item can be gathered from the world
 */
function isGatherable(itemName) {
    const normalized = normalizeItem(itemName);
    return gatherableItems.includes(normalized) ||
        normalized.includes('_log') ||
        normalized.includes('_ore');
}

/**
 * Get the default quantity for an action
 */
function getDefaultQuantity(action) {
    return defaultQuantities[action] || 1;
}

/**
 * Get required tool tier for mining a material
 */
function getRequiredToolTier(materialType) {
    return toolForMaterial[materialType] || null;
}

module.exports = {
    itemSynonyms,
    actionSynonyms,
    toolTiers,
    toolForMaterial,
    gatherableItems,
    craftableItems,
    defaultQuantities,
    normalizeItem,
    normalizeAction,
    isCraftable,
    isGatherable,
    getDefaultQuantity,
    getRequiredToolTier,
};
