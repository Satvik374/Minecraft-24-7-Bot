/**
 * Bot Mind Module
 * Central decision-making brain that coordinates NLU, planning, and execution
 */

const NLUParser = require('./nluParser');
const GoalPlanner = require('./goalPlanner');
const ResponseGenerator = require('./responseGenerator');
const logger = require('../utils/logger');

class BotMind {
    constructor(bot, commandHandler = null) {
        this.bot = bot;
        this.commandHandler = commandHandler;

        // Initialize components
        this.nlu = new NLUParser();
        this.planner = new GoalPlanner(bot);
        this.responder = new ResponseGenerator(bot ? bot.username : 'Bot');

        // State tracking
        this.currentIntent = null;
        this.currentPlan = null;
        this.conversationContext = {};
        this.isExecuting = false;

        // Track recent messages to avoid duplicate responses
        this.recentMessages = [];
        this.lastResponseTime = 0;
    }

    /**
     * Set the command handler (for dependency injection)
     */
    setCommandHandler(handler) {
        this.commandHandler = handler;
    }

    /**
     * Process a player message and decide how to respond
     * @param {string} message - The chat message
     * @param {string} username - The player who sent it
     * @returns {object} - Response with message and action
     */
    async process(message, username) {
        // Skip if the message is from the bot itself
        if (this.bot && username === this.bot.username) {
            return { handled: false };
        }

        // Skip very short or just greetings without requests
        if (message.length < 3) {
            return { handled: false };
        }

        // Skip if we just responded (prevent spam)
        const now = Date.now();
        if (now - this.lastResponseTime < 1000) {
            return { handled: false };
        }

        logger.info(`BotMind: Processing message from ${username}: "${message}"`);

        // Track context
        this.conversationContext[username] = {
            lastMessage: message,
            timestamp: now,
        };

        // Step 1: Understand the message
        const intent = this.understand(message, username);

        if (!intent) {
            // Check if it's directed at the bot (mentions name or is a question)
            const isBotMention = this.bot && message.toLowerCase().includes(this.bot.username.toLowerCase());
            const isQuestion = this.nlu.isRequest(message);

            if (isBotMention || isQuestion) {
                return {
                    handled: true,
                    message: this.responder.confused({ username }),
                    action: null,
                };
            }

            return { handled: false };
        }

        this.currentIntent = intent;
        logger.info(`BotMind: Understood intent: ${JSON.stringify(intent)}`);

        // Step 2: Create a plan
        const plan = this.plan(intent);
        this.currentPlan = plan;

        if (plan.error) {
            return {
                handled: true,
                message: this.responder.error('failed', { target: intent.target, username }),
                action: null,
            };
        }

        if (plan.alreadyHave) {
            return {
                handled: true,
                message: this.responder.alreadyHave({ target: intent.target }),
                action: null,
            };
        }

        // Step 3: Generate response
        const responseContext = {
            username,
            target: intent.originalTarget || intent.target,
            count: intent.count,
        };

        const response = this.responder.starting(intent.action, responseContext);

        // Step 4: Execute the plan (non-blocking)
        this.executeAsync(plan, intent);

        this.lastResponseTime = now;

        return {
            handled: true,
            message: response,
            action: intent.action,
            intent,
            plan,
        };
    }

    /**
     * Understand a message - parse into intent
     */
    understand(message, username) {
        return this.nlu.parse(message, username);
    }

    /**
     * Create a plan from intent
     */
    plan(intent) {
        return this.planner.createPlan(intent);
    }

    /**
     * Execute a plan asynchronously
     */
    async executeAsync(plan, intent) {
        if (!plan || !plan.steps || plan.steps.length === 0) {
            return;
        }

        if (this.isExecuting) {
            logger.debug('BotMind: Already executing a plan, queuing...');
            return;
        }

        this.isExecuting = true;

        try {
            // Simple actions (status, help) don't need command handler
            if (plan.simple) {
                const step = plan.steps[0];
                if (step.type === 'status') {
                    const statusMsg = this.getStatus();
                    this.sendChat(statusMsg);
                } else if (step.type === 'help') {
                    const helpMsg = this.responder.help();
                    this.sendChat(helpMsg);
                }
                return;
            }

            // Execute through command handler if available
            if (this.commandHandler) {
                // Convert intent to command format that commandHandler understands
                const command = {
                    valid: true,
                    action: intent.action,
                    target: intent.target,
                    count: intent.count,
                    username: intent.username,
                };

                logger.info(`BotMind: Executing command: ${JSON.stringify(command)}`);
                await this.commandHandler.execute(command);
            } else {
                logger.warn('BotMind: No command handler available');
            }
        } catch (error) {
            logger.error(`BotMind: Execution error: ${error.message}`);
            this.sendChat(this.responder.error('failed', { target: intent.target }));
        } finally {
            this.isExecuting = false;
            this.currentIntent = null;
            this.currentPlan = null;
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        if (this.currentIntent) {
            const task = `${this.currentIntent.action} ${this.currentIntent.target || ''}`.trim();
            return this.responder.status(true, task);
        }

        if (this.commandHandler) {
            const currentTask = this.commandHandler.getCurrentTask();
            if (currentTask) {
                const task = `${currentTask.action} ${currentTask.target || ''}`.trim();
                return this.responder.status(true, task);
            }
        }

        return this.responder.status(false);
    }

    /**
     * Send a chat message
     */
    sendChat(message) {
        if (!message || !this.bot) return;

        try {
            this.bot.chat(message);
            logger.info(`BotMind Chat: ${message}`);
        } catch (error) {
            logger.debug(`BotMind: Failed to send chat: ${error.message}`);
        }
    }

    /**
     * Check if the mind is currently processing
     */
    isBusy() {
        return this.isExecuting;
    }

    /**
     * Reset the mind state
     */
    reset() {
        this.currentIntent = null;
        this.currentPlan = null;
        this.isExecuting = false;
    }
}

module.exports = BotMind;
