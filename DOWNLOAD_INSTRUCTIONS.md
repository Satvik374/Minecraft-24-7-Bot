# 🤖 Run Your Minecraft Bot 24/7 Forever

Your AI bot is working perfectly! To run it 24/7 without keeping this website open, follow these simple steps:

## 📥 Download and Setup (5 minutes)

### Step 1: Download Node.js
1. Go to https://nodejs.org
2. Download and install the latest version (LTS recommended)
3. This installs Node.js and npm on your computer

### Step 2: Download Bot Files
1. Download all these files to a folder on your computer:
   - `ai-bot.js` (main bot file)
   - `package.json` (dependencies)
   - `utils/logger.js` (logging system)
   - `config.js` (configuration)

### Step 3: Install Dependencies
1. Open Command Prompt (Windows) or Terminal (Mac/Linux)
2. Navigate to your bot folder: `cd path/to/your/bot/folder`
3. Run: `npm install`

### Step 4: Run Your Bot Forever
```bash
# Basic usage
node ai-bot.js

# With your server details
MINECRAFT_HOST=chiku99.aternos.me MINECRAFT_PORT=50044 MINECRAFT_USERNAME=AIPlayer node ai-bot.js

# Keep running even if you close terminal (Windows)
start /min node ai-bot.js

# Keep running in background (Mac/Linux)
nohup node ai-bot.js &
```

## 🎮 Your Bot Features
- **Responds to all player messages** (like Moralta_Gaming's commands)
- **Follows player commands**: "follow me", "explore", "mine", "craft", etc.
- **Creative mode enabled** automatically
- **Smart conversations** with 70% response rate
- **Task switching** based on player requests

## 🔧 Configuration
Edit these settings in the files:
- **Server**: Change `MINECRAFT_HOST` and `MINECRAFT_PORT`
- **Username**: Change `MINECRAFT_USERNAME`
- **Behavior**: Modify response rates and messages in `ai-bot.js`

## 💡 Benefits of Local Running
- ✅ **True 24/7 operation** - runs as long as your computer is on
- ✅ **No browser needed** - completely independent
- ✅ **No Replit limits** - unlimited runtime
- ✅ **Full control** - customize everything
- ✅ **Free forever** - no subscription required

Your bot will keep chatting with players, following commands, and behaving naturally even when you're not around!