/**
 * Natural Language Understanding (NLU) Parser
 * Parses natural language messages into structured intents
 */

const { normalizeItem, normalizeAction, getDefaultQuantity } = require('./knowledge');
const logger = require('../utils/logger');

class NLUParser {
    constructor() {
        // Patterns for different intents
        this.patterns = {
            // Mining/gathering patterns
            mine: [
                /(?:can you |please |could you )?(get|mine|dig|gather|collect|find|bring|fetch|obtain|grab)\s+(?:me\s+)?(?:some\s+)?(\d+)?\s*(.+?)(?:\s+for me)?$/i,
                /(?:i need|i want|give me|bring me)\s+(?:some\s+)?(\d+)?\s*(.+?)$/i,
                /^(\d+)?\s*(.+?)\s+please$/i,
            ],

            // Crafting patterns
            make: [
                /(?:can you |please |could you )?(make|craft|create|build|construct|forge)\s+(?:me\s+)?(?:a\s+)?(\d+)?\s*(.+?)(?:\s+for me)?$/i,
                /(?:i need|i want)\s+(?:a\s+)?(\d+)?\s*(.+?)(?:\s+crafted|made)?$/i,
            ],

            // Navigation patterns
            come: [
                /(?:can you |please |could you )?(come|follow)\s+(?:to\s+)?(?:me|here)?/i,
                /(come here|follow me|come to me|over here)/i,
                /^here$/i,
            ],

            go: [
                /(?:can you |please |could you )?(go|move|walk|run|travel)\s+to\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/i,
                /(?:go to|move to|head to)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/i,
            ],

            // Combat patterns
            kill: [
                /(?:can you |please |could you )?(kill|attack|fight|slay|hunt|destroy)\s+(?:all\s+)?(?:the\s+)?(?:nearby\s+)?(\d+)?\s*(.+?)(?:\s+nearby)?$/i,
                /(kill|attack|fight)\s+(?:all\s+)?(?:the\s+)?(.+)/i,
            ],

            // Farming patterns
            farm: [
                /(?:can you |please |could you )?(farm|harvest|plant|grow)\s+(?:some\s+)?(.+)?/i,
                /(start|begin)\s+farming/i,
            ],

            // Stop patterns
            stop: [
                /(?:can you |please |could you )?(stop|halt|cancel|wait|pause)/i,
                /^stop$/i,
                /stop\s+(?:what you.re doing|that|it|now)/i,
            ],

            // Drop patterns
            drop: [
                /(?:can you |please |could you )?(drop|throw|toss|give)\s+(?:me\s+)?(\d+)?\s*(.+?)$/i,
            ],

            // Status/help patterns
            status: [
                /(?:what are you doing|what.s your status|status|report)/i,
            ],

            help: [
                /(?:help|what can you do|commands|how do i)/i,
            ],
        };

        // Question patterns (to understand context)
        this.questionPatterns = [
            /^can you/i,
            /^could you/i,
            /^would you/i,
            /^will you/i,
            /^do you/i,
            /^are you/i,
        ];
    }

    /**
     * Parse a message into a structured intent
     * @param {string} message - The chat message
     * @param {string} username - The player who sent it
     * @returns {object|null} - Parsed intent or null if not understood
     */
    parse(message, username) {
        const cleanMessage = message.trim();

        // Skip very short messages
        if (cleanMessage.length < 2) return null;

        // Try each intent pattern
        for (const [intentName, patterns] of Object.entries(this.patterns)) {
            for (const pattern of patterns) {
                const match = cleanMessage.match(pattern);
                if (match) {
                    const intent = this.extractIntent(intentName, match, username);
                    if (intent) {
                        logger.debug(`NLU: Matched "${cleanMessage}" to intent: ${JSON.stringify(intent)}`);
                        return intent;
                    }
                }
            }
        }

        // Try keyword fallback
        const keywordIntent = this.parseByKeywords(cleanMessage, username);
        if (keywordIntent) {
            logger.debug(`NLU: Keyword match for "${cleanMessage}": ${JSON.stringify(keywordIntent)}`);
            return keywordIntent;
        }

        return null;
    }

    /**
     * Extract structured intent from regex match
     */
    extractIntent(intentName, match, username) {
        const groups = match.slice(1).filter(g => g !== undefined);

        switch (intentName) {
            case 'mine': {
                // Extract action verb, quantity, and target
                let quantity = null;
                let target = null;

                for (const group of groups) {
                    if (/^\d+$/.test(group)) {
                        quantity = parseInt(group);
                    } else if (group && !['get', 'mine', 'dig', 'gather', 'collect', 'find', 'bring', 'fetch', 'obtain', 'grab', 'some', 'me'].includes(group.toLowerCase())) {
                        target = group;
                    }
                }

                if (!target) return null;

                return {
                    action: 'mine',
                    target: normalizeItem(target),
                    originalTarget: target,
                    count: quantity || getDefaultQuantity('mine'),
                    username,
                    confidence: 0.8,
                };
            }

            case 'make': {
                let quantity = null;
                let target = null;

                for (const group of groups) {
                    if (/^\d+$/.test(group)) {
                        quantity = parseInt(group);
                    } else if (group && !['make', 'craft', 'create', 'build', 'construct', 'forge', 'a', 'an', 'me'].includes(group.toLowerCase())) {
                        target = group;
                    }
                }

                if (!target) return null;

                return {
                    action: 'make',
                    target: normalizeItem(target),
                    originalTarget: target,
                    count: quantity || 1,
                    username,
                    confidence: 0.8,
                };
            }

            case 'come': {
                return {
                    action: 'come',
                    target: username,
                    username,
                    confidence: 0.9,
                };
            }

            case 'go': {
                // Extract coordinates
                const coords = groups.filter(g => /^-?\d+$/.test(g)).map(Number);
                if (coords.length >= 3) {
                    return {
                        action: 'go',
                        target: { x: coords[0], y: coords[1], z: coords[2] },
                        username,
                        confidence: 0.9,
                    };
                }
                return null;
            }

            case 'kill': {
                let target = null;
                let quantity = null;

                for (const group of groups) {
                    if (/^\d+$/.test(group)) {
                        quantity = parseInt(group);
                    } else if (group && !['kill', 'attack', 'fight', 'slay', 'hunt', 'destroy', 'all', 'the', 'nearby'].includes(group.toLowerCase())) {
                        target = group;
                    }
                }

                return {
                    action: 'kill',
                    target: normalizeItem(target || 'hostile'),
                    count: quantity || 10,
                    username,
                    confidence: 0.8,
                };
            }

            case 'farm': {
                return {
                    action: 'farm',
                    target: null,
                    username,
                    confidence: 0.8,
                };
            }

            case 'stop': {
                return {
                    action: 'stop',
                    username,
                    confidence: 0.95,
                };
            }

            case 'drop': {
                let quantity = null;
                let target = null;

                for (const group of groups) {
                    if (/^\d+$/.test(group)) {
                        quantity = parseInt(group);
                    } else if (group && !['drop', 'throw', 'toss', 'give', 'me'].includes(group.toLowerCase())) {
                        target = group;
                    }
                }

                if (!target) return null;

                return {
                    action: 'drop',
                    target: normalizeItem(target),
                    count: quantity || 1,
                    username,
                    confidence: 0.8,
                };
            }

            case 'status': {
                return {
                    action: 'status',
                    username,
                    confidence: 0.9,
                };
            }

            case 'help': {
                return {
                    action: 'help',
                    username,
                    confidence: 0.9,
                };
            }
        }

        return null;
    }

    /**
     * Fallback: Parse by keywords when patterns don't match
     */
    parseByKeywords(message, username) {
        const words = message.toLowerCase().split(/\s+/);

        // Action keywords to check
        const actionKeywords = {
            mine: ['mine', 'dig', 'get', 'gather', 'collect', 'find', 'bring', 'fetch', 'iron', 'diamond', 'coal', 'gold', 'ore', 'wood', 'log'],
            make: ['make', 'craft', 'create', 'build', 'pickaxe', 'sword', 'axe', 'armor'],
            come: ['come', 'follow', 'here'],
            kill: ['kill', 'attack', 'fight', 'zombie', 'skeleton', 'creeper', 'monster'],
            farm: ['farm', 'harvest', 'plant', 'wheat', 'crops'],
            stop: ['stop', 'halt', 'cancel', 'wait'],
        };

        // Find best matching action
        let bestAction = null;
        let bestScore = 0;

        for (const [action, keywords] of Object.entries(actionKeywords)) {
            let score = 0;
            for (const word of words) {
                if (keywords.includes(word)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        }

        if (!bestAction || bestScore === 0) return null;

        // Extract target from remaining words
        let target = null;
        const skipWords = ['please', 'can', 'you', 'could', 'would', 'some', 'me', 'i', 'need', 'want', 'a', 'an', 'the'];

        for (const word of words) {
            if (!skipWords.includes(word) && !Object.values(actionKeywords).flat().includes(word)) {
                target = word;
                break;
            }
        }

        // For specific actions, infer target from context
        if (!target) {
            if (words.includes('iron')) target = 'iron_ore';
            else if (words.includes('diamond')) target = 'diamond_ore';
            else if (words.includes('coal')) target = 'coal_ore';
            else if (words.includes('wood') || words.includes('log')) target = 'oak_log';
            else if (words.includes('pickaxe')) target = 'wooden_pickaxe';
            else if (words.includes('sword')) target = 'wooden_sword';
        }

        return {
            action: bestAction,
            target: normalizeItem(target),
            count: getDefaultQuantity(bestAction),
            username,
            confidence: 0.5, // Lower confidence for keyword matching
        };
    }

    /**
     * Check if a message is likely a question/request directed at bot
     */
    isRequest(message) {
        return this.questionPatterns.some(p => p.test(message)) ||
            message.includes('?') ||
            message.toLowerCase().includes('please');
    }
}

module.exports = NLUParser;
