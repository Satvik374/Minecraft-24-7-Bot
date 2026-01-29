const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ level, message, timestamp, stack }) => {
            if (stack) {
                return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
            }
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),

        // File output
        new winston.transports.File({
            filename: 'bot-error.log',
            level: 'error'
        }),
        new winston.transports.File({
            filename: 'bot.log'
        })
    ]
});

// Handle uncaught exceptions
logger.exceptions.handle(
    new winston.transports.File({ filename: 'exceptions.log' })
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    const errorMessage = reason instanceof Error ? reason.stack || reason.message : String(reason);
    logger.error(`Unhandled Rejection: ${errorMessage}`);
});

module.exports = logger;
