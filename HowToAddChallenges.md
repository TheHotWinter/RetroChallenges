# How to Add Challenges to RetroChallenges

This guide explains how to add new challenges to the RetroChallenges application. Follow these steps to create and integrate your own challenges.

## 📋 Prerequisites

- Basic understanding of Lua scripting
- Access to the RetroChallenges GitHub repository
- EmuHawk/BizHawk emulator for testing
- Legal ROM files for the games you want to create challenges for

## 🎯 Challenge Structure Overview

Challenges are organized in a specific folder structure:

```
challenges/
├── assets/           # Generic assets shared across all challenges
├── utils/           # Pre-built Lua utility scripts
├── nes/             # Nintendo Entertainment System challenges
│   └── [game-name]/ # Individual game folder
│       └── [challenge-name]/ # Individual challenge folder
│           ├── [challenge-name].lua # Main challenge script
│           ├── assets/ # Challenge-specific assets
│           └── savestates/ # Challenge-specific save states
├── snes/            # Super Nintendo challenges (future)
└── challenges.json  # Challenge configuration file
```

## 🚀 Step-by-Step Guide

### Step 1: Choose Your Game

Recommended games:
- **Capcom**: Mega Man, Street Fighter, Ghosts 'n Goblins
- **Konami**: Castlevania, Contra, Gradius
- **Sega**: Sonic, Phantasy Star
- **Other**: Double Dragon, Ninja Gaiden, etc.

### Step 2: Create the Challenge Folder Structure

1. Navigate to `challenges/nes/[game-name]/`
2. Create a new folder for your challenge: `[challenge-name]/`
3. Inside this folder, create:
   - `[challenge-name].lua` - Your main challenge script
   - `assets/` folder (optional) - For challenge-specific assets
   - `savestates/` folder (optional) - For challenge-specific save states

**Example for Mega Man:**
```
challenges/nes/mega_man/
└── defeat_cut_man/
    ├── defeat_cut_man.lua
    ├── assets/
    └── savestates/
```

### Step 3: Write Your Lua Challenge Script

Create a Lua script that monitors the game state and tracks challenge progress. Here's a basic template:

```lua
-- Challenge: [Challenge Name]
-- Game: [Game Name]
-- Description: [What the player needs to accomplish]

local challenge = {
    name = "[Challenge Name]",
    description = "[Challenge Description]",
    target = [target_value], -- e.g., 5000 for points, 1 for boss defeat
    current = 0,
    completed = false,
    start_time = 0
}

-- Initialize challenge
function challenge.init()
    challenge.start_time = emu.framecount()
    console.log("Challenge started: " .. challenge.name)
W    console.log("Target: " .. challenge.target)
end

-- Update challenge progress
function challenge.update()
    if challenge.completed then
        return
    end
    
    -- Read game memory to check progress
    -- Example: Read score from memory address
    local score = memory.readbyte(0x006E) * 100 + memory.readbyte(0x006F)
    
    -- Update current progress
    challenge.current = score
    
    -- Check if challenge is completed
    if challenge.current >= challenge.target then
        challenge.completed = true
        challenge.complete()
    end
end

-- Handle challenge completion
function challenge.complete()
    local completion_time = emu.framecount() - challenge.start_time
    console.log("Challenge completed!")
    console.log("Final score: " .. challenge.current)
    console.log("Completion time: " .. completion_time .. " frames")
    
    -- Write completion data to JSON file
    local completion_data = {
        username = "Player", -- This will be set by the app
        game = "[Game Name]",
        challengeName = challenge.name,
        score = challenge.current,
        completionTime = completion_time,
        date = os.date("%Y-%m-%d %H:%M:%S")
    }
    
    -- Write to JSON file (this will be monitored by the app)
    local json_file = io.open("challenge_data.json", "w")
    if json_file then
        json_file:write(json.encode(completion_data))
        json_file:close()
    end
end

-- Main loop
function main()
    if emu.framecount() == 1 then
        challenge.init()
    end
    
    challenge.update()
    
    -- Display challenge info on screen
    gui.text(10, 10, "Challenge: " .. challenge.name)
    gui.text(10, 25, "Progress: " .. challenge.current .. "/" .. challenge.target)
    gui.text(10, 40, "Status: " .. (challenge.completed and "COMPLETED!" or "In Progress"))
end

-- Run the main loop
main()
```

### Step 4: Test Your Challenge

1. **Load EmuHawk** with your ROM file
2. **Load your Lua script** using Tools > Lua Console
3. **Test the challenge** to ensure it works correctly
4. **Verify completion detection** and JSON output

### Step 5: Update challenges.json

Add your challenge to the `challenges.json` file:

```json
{
  "games": [
    {
      "name": "Mega Man",
      "description": "Classic robot action platformer",
      "rom": "mega_man.nes",
      "challenges": [
        {
          "name": "Defeat Cut Man!",
          "description": "Defeat the Cut Man boss as fast as possible",
          "lua": "nes\\mega_man\\defeat_cut_man\\defeat_cut_man.lua",
          "difficulty": "Medium",
          "estimatedTime": "5-10 minutes"
        }
      ]
    }
  ]
}
```

**Key points:**
- Use `\\` for Windows path separators in the `lua` field
- Match the exact folder structure you created
- Use descriptive names and descriptions
- Set appropriate difficulty and time estimates

### Step 6: Test Integration

1. **Run the RetroChallenges app**
2. **Click Refresh** to download the latest challenges
3. **Select your challenge** from the UI
4. **Click Launch Challenge** to test the full integration
5. **Verify** that EmuHawk launches with your ROM and Lua script

## 🔧 Lua Scripting Tips

### Memory Reading
```lua
-- Read single byte
local value = memory.readbyte(0x006E)

-- Read 16-bit value (little-endian)
local value = memory.readbyte(0x006E) + (memory.readbyte(0x006F) * 256)

-- Read from different memory regions
local value = memory.readbyte(0x006E, "WRAM") -- Work RAM
local value = memory.readbyte(0x2000, "PPU")  -- PPU memory
```

### Common Game Memory Addresses
- **Score**: Usually around 0x006E-0x0070
- **Lives**: Often at 0x0075
- **Level/Stage**: Typically 0x0076
- **Boss Health**: Varies by game

### Debugging
```lua
-- Print debug information
console.log("Debug: " .. value)

-- Display on screen
gui.text(10, 10, "Debug: " .. value)

-- Check if memory address exists
if memory.readbyte(0x006E) then
    -- Address exists
end
```

## 📁 File Naming Conventions

- **Game folders**: Use lowercase with underscores (`mega_man`, `street_fighter`)
- **Challenge folders**: Use descriptive names (`defeat_cut_man`, `speed_run_level_1`)
- **Lua files**: Match the challenge folder name (`defeat_cut_man.lua`)
- **ROM files**: Use lowercase with underscores (`mega_man.nes`)

## 🚫 Important Restrictions

### Nintendo IP Policy
- **NEVER** use Nintendo games, characters, or references
- **NEVER** create challenges for Mario, Zelda, Pokemon, etc.
- **ONLY** use non-Nintendo games (Capcom, Konami, Sega, etc.)

### Legal Considerations
- Only create challenges for games you legally own
- Don't distribute ROM files
- Respect copyright and intellectual property rights

## 🐛 Troubleshooting

### Common Issues

**Challenge not appearing in UI:**
- Check `challenges.json` syntax
- Verify folder structure matches the `lua` path
- Ensure proper path separators (`\\` for Windows)

**Lua script not loading:**
- Check for syntax errors in your Lua script
- Verify memory addresses are correct
- Test the script directly in EmuHawk first

**Challenge not completing:**
- Verify your completion logic
- Check memory addresses are being read correctly
- Ensure JSON output is properly formatted

**EmuHawk not launching:**
- Verify ROM file exists and is named correctly
- Check EmuHawk path is configured
- Ensure ROM file is compatible with EmuHawk

## 📚 Resources

- [EmuHawk Lua API Documentation](https://github.com/TASEmulators/BizHawk)
- [NES Memory Map Reference](https://wiki.nesdev.com/w/index.php/CPU_memory_map)
- [Lua Programming Language](https://www.lua.org/manual/5.1/)

## 🤝 Contributing

1. **Fork** the repository
2. **Create** your challenge following this guide
3. **Test** thoroughly
4. **Submit** a pull request with your changes
5. **Include** a description of your challenge and how to test it

## 📝 Example Challenge: Mega Man Boss Rush

Here's a complete example of a Mega Man challenge:

**Folder Structure:**
```
challenges/nes/mega_man/
└── boss_rush/
    ├── boss_rush.lua
    └── assets/
```

**boss_rush.lua:**
```lua
-- Challenge: Boss Rush
-- Game: Mega Man
-- Description: Defeat 4 Robot Masters in a single playthrough

local challenge = {
    name = "Boss Rush",
    description = "Defeat 4 Robot Masters",
    target = 4,
    current = 0,
    completed = false,
    start_time = 0,
    defeated_bosses = {}
}

function challenge.init()
    challenge.start_time = emu.framecount()
    console.log("Boss Rush challenge started!")
end

function challenge.update()
    if challenge.completed then
        return
    end
    
    -- Check for boss defeats (this is simplified - you'd need to find the actual memory addresses)
    local boss_defeated = memory.readbyte(0x0076) -- Example address
    
    if boss_defeated > 0 and not challenge.defeated_bosses[boss_defeated] then
        challenge.defeated_bosses[boss_defeated] = true
        challenge.current = challenge.current + 1
        console.log("Boss defeated! Total: " .. challenge.current .. "/" .. challenge.target)
    end
    
    if challenge.current >= challenge.target then
        challenge.completed = true
        challenge.complete()
    end
end

function challenge.complete()
    local completion_time = emu.framecount() - challenge.start_time
    console.log("Boss Rush completed!")
    
    local completion_data = {
        username = "Player",
        game = "Mega Man",
        challengeName = challenge.name,
        score = challenge.current,
        completionTime = completion_time,
        date = os.date("%Y-%m-%d %H:%M:%S")
    }
    
    local json_file = io.open("challenge_data.json", "w")
    if json_file then
        json_file:write(json.encode(completion_data))
        json_file:close()
    end
end

function main()
    if emu.framecount() == 1 then
        challenge.init()
    end
    
    challenge.update()
    
    gui.text(10, 10, "Challenge: " .. challenge.name)
    gui.text(10, 25, "Bosses Defeated: " .. challenge.current .. "/" .. challenge.target)
    gui.text(10, 40, "Status: " .. (challenge.completed and "COMPLETED!" or "In Progress"))
end

main()
```

**challenges.json entry:**
```json
{
  "name": "Boss Rush",
  "description": "Defeat 4 Robot Masters in a single playthrough",
  "lua": "nes\\mega_man\\boss_rush\\boss_rush.lua",
  "difficulty": "Hard",
  "estimatedTime": "20-30 minutes"
}
```

---

**Happy Challenge Creating!** 🎮✨

Remember to test thoroughly and follow the guidelines to ensure your challenges work seamlessly with the RetroChallenges application.
