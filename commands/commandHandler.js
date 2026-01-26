/**
 * Command Handler for Bot Commands
 * Routes parsed commands to appropriate ability modules
 */

const logger = require('../utils/logger');
const HomeManager = require('../abilities/homeManager');

class CommandHandler {
    constructor(bot) {
        this.bot = bot;
        this.abilities = {};
        this.currentTask = null;
        this.taskQueue = [];
        this.isExecuting = false;

        // Initialize HomeManager
        // Note: Pathfinder is passed when abilities are registered in ai-bot.js, 
        // but we can also instantiate it here if needed, though typically 
        // initialization happens in ai-bot.js. 
        // For now, we'll wait for ai-bot.js to register it properly, 
        // OR we can lazy-load it if we have access to pathfinder.
    }

    /**
     * Register an ability handler
     * @param {string} action - The action name (mine, kill, etc.)
     * @param {object} handler - The ability handler instance
     */
    registerAbility(action, handler) {
        this.abilities[action] = handler;
        logger.info(`Registered ability: ${action}`);
    }

    /**
     * Execute a parsed command
     * @param {object} command - Parsed command from CommandParser
     */
    async execute(command) {
        if (!command.valid) {
            this.sendChat(command.error);
            return;
        }

        logger.info(`Executing command: ${command.action} from ${command.username}`);

        try {
            switch (command.action) {
                case 'stop':
                    await this.handleStop(command);
                    break;
                case 'stop_random':
                    await this.handleStopRandom(command);
                    break;
                case 'stop_farm':
                    await this.handleStopFarm(command);
                    break;
                case 'start_random':
                    await this.handleStartRandom(command);
                    break;
                case 'start_farm':
                    await this.handleStartFarm(command);
                    break;
                case 'status':
                    await this.handleStatus(command);
                    break;
                case 'help':
                    await this.handleHelp(command);
                    break;
                case 'location':
                    await this.handleLocation(command);
                    break;
                case 'show_inventory':
                    await this.handleShowInventory(command);
                    break;
                case 'collect':
                    const navigation = this.abilities['come']; // Navigation ability registered as 'come'/'go'
                    if (navigation) {
                        // Start collection task
                        if (this.currentTask) await this.stopCurrentTask();
                        this.currentTask = {
                            action: 'collect',
                            username: command.username,
                            startTime: Date.now(),
                            status: 'running'
                        };
                        this.isExecuting = true;

                        // Execute collection
                        navigation.collectAllItems().finally(() => {
                            this.currentTask = null;
                            this.isExecuting = false;
                        });
                        this.sendChat('Started collecting items...');
                    } else {
                        this.sendChat('Navigation ability not initialized');
                    }
                    break;
                case 'follow':
                    const followNav = this.abilities['come'];
                    if (followNav) {
                        await followNav.follow(command.target);
                    } else {
                        this.sendChat('Navigation ability not initialized');
                    }
                    break;
                case 'drop':
                    await this.handleDrop(command);
                    break;
                case 'sethome':
                case 'home':
                    // Route to home manager
                    const homeManager = this.abilities['home'];
                    if (homeManager) {
                        await homeManager.execute(command);
                    } else {
                        this.sendChat('Home ability not initialized');
                    }
                    break;
                case 'sort':
                    // Route to sort ability (homeManager handles sort)
                    const sortAbility = this.abilities['sort'];
                    if (sortAbility) {
                        await sortAbility.execute(command);
                    } else {
                        this.sendChat('Sort ability not initialized');
                    }
                    break;
                case 'mine_all':
                    // Route to miner
                    if (this.abilities['mine']) {
                        // Change action to 'mine' so executeAbility finds the right handler
                        command.action = 'mine';
                        command.target = 'mine_all';
                        await this.executeAbility(command);
                    } else {
                        this.sendChat('Mining ability not initialized');
                    }
                    break;
                case 'equip':
                    const inventoryManager = this.abilities['inventory'];
                    if (inventoryManager) {
                        await inventoryManager.execute(command);
                    } else {
                        this.sendChat('Inventory ability not initialized');
                    }
                    break;
                case 'set_respawn':
                    const sleeperAbility = this.abilities['sleeper'];
                    if (sleeperAbility) {
                        await sleeperAbility.setRespawn();
                    } else {
                        this.sendChat('Sleeper ability not initialized');
                    }
                    break;
                case 'enable_defense':
                    if (this.abilities['kill']) {
                        await this.abilities['kill'].startAutoDefense();
                    } else {
                        this.sendChat('Combat ability not initialized');
                    }
                    break;
                case 'disable_defense':
                    if (this.abilities['kill']) {
                        await this.abilities['kill'].stopAutoDefense();
                    } else {
                        this.sendChat('Combat ability not initialized');
                    }
                    break;
                case 'enable_pvp':
                    if (this.abilities['kill']) {
                        this.abilities['kill'].enablePvp();
                    } else {
                        this.sendChat('Combat ability not initialized');
                    }
                    break;
                case 'disable_pvp':
                    if (this.abilities['kill']) {
                        this.abilities['kill'].disablePvp();
                    } else {
                        this.sendChat('Combat ability not initialized');
                    }
                    break;
                default:
                    await this.executeAbility(command);
            }
        } catch (error) {
            logger.error(`Command execution error: ${error.message}`);
            this.sendChat(`Error: ${error.message}`);
        }
    }

    /**
     * Execute an ability command
     */
    async executeAbility(command) {
        const ability = this.abilities[command.action];

        if (!ability) {
            this.sendChat(`Ability not available: ${command.action}`);
            return;
        }

        // Stop current task if any
        if (this.currentTask) {
            await this.stopCurrentTask();
        }

        this.currentTask = {
            action: command.action,
            target: command.target,
            count: command.count,
            username: command.username,
            startTime: Date.now(),
            status: 'running'
        };

        this.isExecuting = true;
        this.sendChat(`Starting: ${command.action} ${typeof command.target === 'object' ? JSON.stringify(command.target) : command.target}`);

        try {
            await ability.execute(command);
            this.sendChat(`Completed: ${command.action}`);
        } catch (error) {
            logger.error(`Ability execution error: ${error.message}`);
            this.sendChat(`Failed: ${error.message}`);
        } finally {
            this.currentTask = null;
            this.isExecuting = false;
        }
    }

    /**
     * Handle stop command
     */
    async handleStop(command) {
        if (this.currentTask) {
            await this.stopCurrentTask();
            this.sendChat('Stopped current task');
        } else {
            this.sendChat('No task running');
        }
    }

    /**
     * Handle stop random command - disables random AI behaviors
     */
    async handleStopRandom(command) {
        // Access global botState to disable random behaviors
        if (global.botState) {
            global.botState.randomBehaviorsEnabled = false;
            this.sendChat('Random behaviors disabled (moving, jumping, chatting)');
            logger.info('Random AI behaviors disabled by command');
        } else {
            this.sendChat('Random behaviors disabled');
        }
    }

    /**
     * Handle start random command - enables random AI behaviors
     */
    async handleStartRandom(command) {
        // Access global botState to enable random behaviors
        if (global.botState) {
            global.botState.randomBehaviorsEnabled = true;
            this.sendChat('Random behaviors enabled');
            logger.info('Random AI behaviors enabled by command');
        } else {
            this.sendChat('Random behaviors enabled');
        }
    }

    /**
     * Handle start farm command - starts continuous farming
     */
    async handleStartFarm(command) {
        const farmingAbility = this.abilities['farm'];

        if (!farmingAbility) {
            this.sendChat('Farming ability not available');
            return;
        }

        // Stop current task if any
        if (this.currentTask) {
            await this.stopCurrentTask();
        }

        this.currentTask = {
            action: 'farm',
            username: command.username,
            startTime: Date.now(),
            status: 'running'
        };
        this.isExecuting = true;

        // Run farming in background (don't await, so it runs continuously)
        farmingAbility.execute(command).catch(error => {
            logger.error(`Farming error: ${error.message}`);
            this.sendChat(`Farming stopped due to error: ${error.message}`);
        }).finally(() => {
            this.currentTask = null;
            this.isExecuting = false;
        });

        logger.info('Farming: Started by command');
    }

    /**
     * Handle stop farm command - stops continuous farming
     */
    async handleStopFarm(command) {
        const farmingAbility = this.abilities['farm'];

        if (farmingAbility) {
            await farmingAbility.stop();
            this.sendChat('Farming stopped');
            logger.info('Farming: Stopped by command');
        } else {
            this.sendChat('No farming task to stop');
        }

        if (this.currentTask && this.currentTask.action === 'farm') {
            this.currentTask = null;
            this.isExecuting = false;
        }
    }

    /**
     * Stop the currently running task
     */
    async stopCurrentTask() {
        if (this.currentTask && this.abilities[this.currentTask.action]) {
            try {
                await this.abilities[this.currentTask.action].stop();
            } catch (error) {
                logger.debug(`Error stopping task: ${error.message}`);
            }
        }
        this.currentTask = null;
        this.isExecuting = false;

        // Stop all bot movement
        this.bot.setControlState('forward', false);
        this.bot.setControlState('back', false);
        this.bot.setControlState('left', false);
        this.bot.setControlState('right', false);
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('jump', false);
    }

    /**
     * Handle drop command - drop items from inventory
     */
    async handleDrop(command) {
        const itemName = command.target;
        const count = command.count || 1;

        // Handle 'drop all' command
        if (itemName === 'all') {
            const inventory = this.bot.inventory.items();
            if (inventory.length === 0) {
                this.sendChat('Inventory is already empty!');
                return;
            }

            this.sendChat(`Dropping all ${inventory.length} stacks from inventory...`);

            for (const item of inventory) {
                try {
                    await this.bot.toss(item.type, null, item.count);
                    await this.delay(100); // Small delay to prevent server kick
                } catch (error) {
                    logger.debug(`Failed to drop ${item.name}: ${error.message}`);
                }
            }

            this.sendChat('Inventory cleared!');
            return;
        }

        // Find matching items in inventory
        const inventory = this.bot.inventory.items();
        const matchingItems = inventory.filter(item =>
            item.name === itemName ||
            item.name.includes(itemName) ||
            itemName.includes(item.name)
        );

        if (matchingItems.length === 0) {
            this.sendChat(`No ${itemName} in inventory`);
            return;
        }

        let totalDropped = 0;
        let remaining = count;

        for (const item of matchingItems) {
            if (remaining <= 0) break;

            const dropAmount = Math.min(item.count, remaining);
            try {
                await this.bot.toss(item.type, null, dropAmount);
                totalDropped += dropAmount;
                remaining -= dropAmount;
                logger.info(`Dropped ${dropAmount} ${item.name}`);
            } catch (error) {
                logger.debug(`Failed to drop ${item.name}: ${error.message}`);
            }
        }

        if (totalDropped > 0) {
            this.sendChat(`Dropped ${totalDropped} ${itemName}`);
        } else {
            this.sendChat(`Could not drop ${itemName}`);
        }
    }

    /**
     * Handle status command
     */
    async handleStatus(command) {
        if (this.currentTask) {
            const elapsed = Math.floor((Date.now() - this.currentTask.startTime) / 1000);
            this.sendChat(`Task: ${this.currentTask.action} ${this.currentTask.target || ''} | Running for ${elapsed}s`);
        } else {
            this.sendChat('No task running. Ready for commands!');
        }
    }

    /**
     * Handle location command - report bot's current coordinates
     */
    async handleLocation(command) {
        const pos = this.bot.entity.position;
        const x = Math.round(pos.x);
        const y = Math.round(pos.y);
        const z = Math.round(pos.z);
        this.sendChat(`My location: X:${x} Y:${y} Z:${z}`);
    }

    /**
     * Handle show inventory command - list items in bot's inventory
     */
    async handleShowInventory(command) {
        const items = this.bot.inventory.items();

        if (items.length === 0) {
            this.sendChat('My inventory is empty');
            return;
        }

        // Group items by name and count
        const itemCounts = {};
        for (const item of items) {
            const name = item.name.replace(/_/g, ' ');
            itemCounts[name] = (itemCounts[name] || 0) + item.count;
        }

        // Format as compact list
        const itemList = Object.entries(itemCounts)
            .map(([name, count]) => `${count}x ${name}`)
            .join(', ');

        // Split into multiple messages if too long
        if (itemList.length > 200) {
            const entries = Object.entries(itemCounts);
            this.sendChat(`Inventory (${items.length} stacks, ${entries.length} types):`);
            await this.delay(500);

            // Send in chunks
            let chunk = '';
            for (const [name, count] of entries) {
                const item = `${count}x ${name}, `;
                if (chunk.length + item.length > 200) {
                    this.sendChat(chunk.slice(0, -2));
                    await this.delay(500);
                    chunk = item;
                } else {
                    chunk += item;
                }
            }
            if (chunk.length > 0) {
                this.sendChat(chunk.slice(0, -2));
            }
        } else {
            this.sendChat(`Inventory: ${itemList}`);
        }
    }

    /**
     * Handle help command
     */
    async handleHelp(command) {
        const helpLines = [
            'Commands: mine, kill, come, go, make, start farm, stop farm, stop, status',
            'Example: -bot mine iron_ore | -bot come | -bot start farm | -bot drop dirt 32'
        ];

        for (const line of helpLines) {
            this.sendChat(line);
            await this.delay(500); // Prevent spam
        }
    }

    /**
     * Send a chat message from the bot
     */
    sendChat(message) {
        try {
            this.bot.chat(message);
            logger.info(`Bot: ${message}`);
        } catch (error) {
            logger.debug(`Failed to send chat: ${error.message}`);
        }
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if a task is currently running
     */
    isTaskRunning() {
        return this.isExecuting && this.currentTask !== null;
    }

    /**
     * Get current task info
     */
    getCurrentTask() {
        return this.currentTask;
    }
}

module.exports = CommandHandler;
