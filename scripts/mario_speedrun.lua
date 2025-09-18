-- Super Mario Bros Speed Run Level 1 Challenge
-- This script monitors completion of Level 1 and writes completion data with time

local json_file_path = "challenge_data.json"
local challenge_completed = false
local start_time = 0

-- Function to write challenge completion data
function write_challenge_completion(score, time_played)
    local current_time = os.date("!%Y-%m-%dT%H:%M:%S.000Z")
    
    local challenge_data = {
        username = "player123", -- This should be set dynamically
        score = score,
        time = time_played,
        game = "Super Mario Bros",
        challengeName = "Speed Run Level 1",
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
    
    print("Super Mario Bros Speed Run Level 1 challenge completed!")
    print("Score: " .. score)
    print("Time: " .. time_played)
end

-- Function to format time
function format_time(seconds)
    local minutes = math.floor(seconds / 60)
    local secs = seconds % 60
    return string.format("%02d:%02d", minutes, secs)
end

-- Main challenge logic
function check_challenge()
    -- This is where you would read the actual game state from memory
    -- Check if Level 1 is completed
    local level_completed = false -- This should be read from game memory
    local current_score = 0      -- This should be read from game memory
    local current_time = 0       -- This should be calculated from game time
    
    -- Example: Read level completion status from memory (address would be game-specific)
    -- level_completed = memory.readbyte(0x075F) == 2 -- Example: Level 1-2 flag
    
    -- Calculate time elapsed (this would be more sophisticated in a real implementation)
    if start_time == 0 then
        start_time = os.time()
    end
    
    current_time = os.time() - start_time
    
    if level_completed and not challenge_completed then
        challenge_completed = true
        local time_played = format_time(current_time)
        write_challenge_completion(current_score, time_played)
    end
end

-- Run the check every frame
while true do
    check_challenge()
    emu.frameadvance()
end
