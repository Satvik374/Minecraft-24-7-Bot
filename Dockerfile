# Dockerfile for Minecraft AI Bot

FROM node:22-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install --production

# Bundle app source
COPY . .

# Set default environment variables
ENV MINECRAFT_HOST=chiku99.aternos.me
ENV MINECRAFT_PORT=50044
ENV MINECRAFT_USERNAME=24-7_bot
ENV PORT=10000

# Expose the web dashboard port
EXPOSE 10000

# Command to run the bot
# Defaults to bot-with-database.js as it's the current main variant being used
CMD [ "node", "bot-with-database.js" ]
