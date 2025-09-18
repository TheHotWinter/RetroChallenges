-- Castlevania 5000 Points Challenge
-- This script monitors the player's score and writes completion data when 5000 points are reached

local json_file_path = "challenge_data.json"
local target_score = 5000
local challenge_completed = false

-- Function to write challenge completion data
function write_challenge_completion(score, time_played)
    local current_time = os.date("!%Y-%m-%dT%H:%M:%S.000Z")
    
    local challenge_data = {
        username = "player123", -- This should be set dynamically
        score = score,
        time = time_played,
        game = "Castlevania",
        challengeName = "Get 5000 points!",
        date = current_time
    }
    
    local json_string = string.format([[
{
    "username": "%s",
    "score": %d,
    "time": "%s",
    "game": "%s",
    "challengeName": "%s",
    "date": "%s"
}]], 
        challenge_data.username,
        challenge_data.score,
        challenge_data.time,
        challenge_data.game,
        challenge_data.challengeName,
        challenge_data.date
    )
    
    -- Write to file (implementation depends on EmuHawk Lua environment)
    console.log("Challenge completed: " .. json_string)
    
    -- In a real implementation, you would write this to the actual JSON file
    -- For now, we'll just log it
    print("Castlevania 5000 points challenge completed!")
    print("Score: " .. score)
    print("Time: " .. time_played)
end

-- Main challenge logic
function check_challenge()
    -- This is where you would read the actual game state from memory
    -- For example, reading the score from a specific memory address
    local current_score = 0 -- This should be read from game memory
    
    -- Example: Read score from memory (address would be game-specific)
    -- current_score = memory.readbyte(0x006E) * 100 + memory.readbyte(0x006F)
    
    if current_score >= target_score and not challenge_completed then
        challenge_completed = true
        local time_played = "05:45" -- This should be calculated from game time
        write_challenge_completion(current_score, time_played)
    end
end

-- Run the check every frame
while true do
    check_challenge()
    emu.frameadvance()
end
