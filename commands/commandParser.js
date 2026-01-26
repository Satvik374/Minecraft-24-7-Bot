/**
 * Command Parser for Bot Chat Commands
 * Parses messages in format: -bot <action> <target>
 */

const logger = require('../utils/logger');

class CommandParser {
    constructor() {
        this.prefix = '-bot';
        this.validActions = ['mine', 'kill', 'come', 'go', 'make', 'drop', 'stop', 'start', 'status', 'help', 'sethome', 'home', 'mine_all', 'collect', 'sort', 'equip', 'set', 'enable', 'disable', 'follow', 'location', 'loc', 'pos', 'where', 'inventory', 'inv', 'nether'];
    }

    /**
     * Parse a chat message for bot commands
     * @param {string} message - The chat message
     * @param {string} username - The player who sent the message
     * @returns {object|null} - Parsed command object or null if not a valid command
     */
    parse(message, username) {
        const trimmedMessage = message.trim().toLowerCase();

        // Check if message starts with bot prefix
        if (!trimmedMessage.startsWith(this.prefix)) {
            return null;
        }

        // Remove prefix and split into parts
        const commandPart = trimmedMessage.substring(this.prefix.length).trim();
        const parts = commandPart.split(/\s+/);

        if (parts.length === 0 || parts[0] === '') {
            return {
                valid: false,
                error: 'No command specified. Use: -bot help',
                username
            };
        }

        const action = parts[0];
        const args = parts.slice(1);

        // Validate action
        if (!this.validActions.includes(action)) {
            return {
                valid: false,
                error: `Unknown command: ${action}. Valid commands: ${this.validActions.join(', ')}`,
                username
            };
        }

        // Parse based on action type
        return this.parseAction(action, args, username, message);
    }

    /**
     * Parse specific action with its arguments
     */
    parseAction(action, args, username, originalMessage) {
        switch (action) {
            case 'mine':
                return this.parseMineCommand(args, username);
            case 'kill':
                return this.parseKillCommand(args, username);
            case 'come':
                return this.parseComeCommand(args, username);
            case 'go':
                return this.parseGoCommand(args, username);
            case 'make':
                return this.parseMakeCommand(args, username);
            case 'drop':
                return this.parseDropCommand(args, username);
            case 'sort':
                return this.parseSortCommand(args, username);
            case 'stop':
                return this.parseStopCommand(args, username);
            case 'start':
                return this.parseStartCommand(args, username);
            case 'equip':
                return this.parseEquipCommand(args, username);
            case 'set':
                return this.parseSetCommand(args, username);
            case 'enable':
                return this.parseEnableCommand(args, username);
            case 'disable':
                return this.parseDisableCommand(args, username);
            case 'follow':
                return this.parseFollowCommand(args, username);
            case 'sethome':
                return { valid: true, action: 'sethome', username };
            case 'home':
                if (args.length > 0 && args[0] === 'deposit') {
                    return { valid: true, action: 'home', target: 'deposit', username };
                }
                return { valid: true, action: 'home', username };
            case 'mine_all':
                return { valid: true, action: 'mine_all', username };
            case 'collect':
                return { valid: true, action: 'collect', username };
            case 'status':
                return { valid: true, action: 'status', username };
            case 'location':
            case 'loc':
            case 'pos':
            case 'where':
                return { valid: true, action: 'location', username };
            case 'inventory':
            case 'inv':
                return { valid: true, action: 'show_inventory', username };
            case 'nether':
                return { valid: true, action: 'nether', username };
            case 'help':
                return { valid: true, action: 'help', username };
            default:
                return { valid: false, error: `Unknown action: ${action}`, username };
        }
    }

    /**
     * Parse sort command: -bot sort chests [sourceX sourceY sourceZ destX destY destZ]
     */
    parseSortCommand(args, username) {
        // Default sort without subcommand
        if (args.length === 0) {
            return {
                valid: true,
                action: 'sort',
                subAction: 'inventory',
                username
            };
        }

        const subAction = args[0];

        // -bot sort chests - sort and consolidate all nearby chests
        if (subAction === 'chests') {
            // Check if coordinates provided for chest-to-chest transfer
            if (args.length >= 7) {
                const sourceX = parseFloat(args[1]);
                const sourceY = parseFloat(args[2]);
                const sourceZ = parseFloat(args[3]);
                const destX = parseFloat(args[4]);
                const destY = parseFloat(args[5]);
                const destZ = parseFloat(args[6]);

                if (isNaN(sourceX) || isNaN(sourceY) || isNaN(sourceZ) ||
                    isNaN(destX) || isNaN(destY) || isNaN(destZ)) {
                    return {
                        valid: false,
                        error: 'Invalid coordinates. Use: -bot sort chests <srcX> <srcY> <srcZ> <destX> <destY> <destZ>',
                        username
                    };
                }

                return {
                    valid: true,
                    action: 'sort',
                    subAction: 'transfer',
                    source: { x: sourceX, y: sourceY, z: sourceZ },
                    destination: { x: destX, y: destY, z: destZ },
                    username
                };
            }

            // Just sort all nearby chests
            return {
                valid: true,
                action: 'sort',
                subAction: 'chests',
                username
            };
        }

        return {
            valid: false,
            error: 'Use: -bot sort chests OR -bot sort chests <srcX> <srcY> <srcZ> <destX> <destY> <destZ>',
            username
        };
    }

    /**
     * Parse stop command: -bot stop [action]
     */
    parseStopCommand(args, username) {
        if (args.length > 0 && args[0] === 'random') {
            return { valid: true, action: 'stop_random', username };
        }
        if (args.length > 0 && args[0] === 'farm') {
            return { valid: true, action: 'stop_farm', username };
        }
        return { valid: true, action: 'stop', username };
    }

    /**
     * Parse start command: -bot start [random|farm]
     */
    parseStartCommand(args, username) {
        if (args.length > 0 && args[0] === 'random') {
            return { valid: true, action: 'start_random', username };
        }
        if (args.length > 0 && args[0] === 'farm') {
            return { valid: true, action: 'start_farm', username };
        }
        return {
            valid: false,
            error: 'Use: -bot start random OR -bot start farm',
            username
        };
    }

    /**
     * Parse mine command: -bot mine <block_type> [count]
     */
    parseMineCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to mine. Example: -bot mine diamond_ore',
                username
            };
        }

        const blockType = args[0].replace(/-/g, '_');
        const count = args.length > 1 ? parseInt(args[1]) || 64 : 64;

        return {
            valid: true,
            action: 'mine',
            target: blockType,
            count: Math.min(count, 256), // Cap at 256
            username
        };
    }

    /**
     * Parse equip command: -bot equip <item_name>
     */
    parseEquipCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to equip. Example: -bot equip iron_chestplate',
                username
            };
        }

        const itemName = args[0].replace(/-/g, '_');

        return {
            valid: true,
            action: 'equip',
            target: itemName,
            username
        };
    }

    /**
     * Parse set command: -bot set <target>
     */
    parseSetCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to set. Example: -bot set respawn',
                username
            };
        }

        const target = args[0].toLowerCase();

        if (target === 'respawn') {
            return {
                valid: true,
                action: 'set_respawn',
                username
            };
        }

        return {
            valid: false,
            error: `Unknown set target: ${target}. Try: -bot set respawn`,
            username
        };
    }

    /**
     * Parse enable command: -bot enable <feature>
     */
    parseEnableCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to enable. Example: -bot enable defense',
                username
            };
        }

        const target = args[0].toLowerCase();

        if (target === 'defense') {
            return {
                valid: true,
                action: 'enable_defense',
                username
            };
        }

        if (target === 'pvp') {
            return {
                valid: true,
                action: 'enable_pvp',
                username
            };
        }

        return {
            valid: false,
            error: `Unknown enable target: ${target}`,
            username
        };
    }

    /**
     * Parse follow command: -bot follow [player]
     */
    parseFollowCommand(args, username) {
        let target = username; // Default to sender ("me")

        if (args.length > 0) {
            const arg = args[0].toLowerCase();
            if (arg !== 'me') {
                target = args[0]; // Specific player
            }
        }

        return {
            valid: true,
            action: 'follow',
            target: target,
            username
        };
    }
    parseDisableCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to disable. Example: -bot disable defense',
                username
            };
        }

        const target = args[0].toLowerCase();

        if (target === 'defense') {
            return {
                valid: true,
                action: 'disable_defense',
                username
            };
        }

        if (target === 'pvp') {
            return {
                valid: true,
                action: 'disable_pvp',
                username
            };
        }

        return {
            valid: false,
            error: `Unknown disable target: ${target}`,
            username
        };
    }
    /**
     * Parse kill command: -bot kill <mob_type>
     */
    parseKillCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to kill. Example: -bot kill zombie',
                username
            };
        }

        const mobType = args[0].replace(/-/g, '_');

        return {
            valid: true,
            action: 'kill',
            target: mobType,
            username
        };
    }

    /**
     * Parse come command: -bot come [player_name]
     */
    parseComeCommand(args, username) {
        // If no player specified, come to the player who issued the command
        const targetPlayer = args.length > 0 ? args[0] : username;

        return {
            valid: true,
            action: 'come',
            target: targetPlayer,
            username
        };
    }

    /**
     * Parse go command: -bot go <x> <y> <z>
     */
    parseGoCommand(args, username) {
        if (args.length < 3) {
            return {
                valid: false,
                error: 'Specify coordinates. Example: -bot go 100 64 -200',
                username
            };
        }

        const x = parseFloat(args[0]);
        const y = parseFloat(args[1]);
        const z = parseFloat(args[2]);

        if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return {
                valid: false,
                error: 'Invalid coordinates. Use numbers only.',
                username
            };
        }

        return {
            valid: true,
            action: 'go',
            target: { x, y, z },
            username
        };
    }

    /**
     * Parse make command: -bot make <item> [count]
     */
    parseMakeCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to make. Example: -bot make diamond_pickaxe',
                username
            };
        }

        const itemName = args[0].replace(/-/g, '_');
        const count = args.length > 1 ? parseInt(args[1]) || 1 : 1;

        return {
            valid: true,
            action: 'make',
            target: itemName,
            count: Math.min(count, 64), // Cap at 64
            username
        };
    }

    /**
     * Parse drop command: -bot drop <item> [count]
     */
    parseDropCommand(args, username) {
        if (args.length === 0) {
            return {
                valid: false,
                error: 'Specify what to drop. Example: -bot drop dirt 32',
                username
            };
        }

        const itemName = args[0].replace(/-/g, '_');
        const count = args.length > 1 ? parseInt(args[1]) || 1 : 1;

        return {
            valid: true,
            action: 'drop',
            target: itemName,
            count: Math.min(count, 64), // Cap at 64
            username
        };
    }

    /**
     * Get help text for all commands
     */
    getHelpText() {
        return [
            '=== Bot Commands ===',
            '-bot mine <block> [count] - Mine blocks (e.g., -bot mine iron_ore 32)',
            '-bot kill <mob> - Kill mobs (e.g., -bot kill zombie)',
            '-bot come [player] - Come to player (e.g., -bot come)',
            '-bot go <x> <y> <z> - Go to coordinates',
            '-bot make <item> [count] - Craft item (e.g., -bot make diamond_pickaxe)',
            '-bot nether - Find and enter nearest Nether portal safely',
            '-bot location - Show coordinates',
            '-bot inventory - List items',
            '-bot stop - Stop current task',
            '-bot status - Show current task status'
        ];
    }
}

module.exports = CommandParser;
