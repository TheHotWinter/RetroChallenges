-- Super Mario Bros 5 1ups Challenge
-- This script monitors the number of lives and writes completion data when 5 extra lives are obtained

local json_file_path = "challenge_data.json"
local target_lives = 5
local challenge_completed = false

-- Function to write challenge completion data
function write_challenge_completion(lives_count, time_played)
    local current_time = os.date("!%Y-%m-%dT%H:%M:%S.000Z")
    
    local challenge_data = {
        username = "player123", -- This should be set dynamically
        score = 0, -- Score might not be relevant for this challenge
        time = time_played,
        game = "Super Mario Bros",
        challengeName = "Get 5 1ups!",
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
    
    print("Super Mario Bros 5 1ups challenge completed!")
    print("Lives: " .. lives_count)
    print("Time: " .. time_played)
end

-- Main challenge logic
function check_challenge()
    -- This is where you would read the actual game state from memory
    -- Read the number of lives from memory
    local current_lives = 3 -- This should be read from game memory
    
    -- Example: Read lives from memory (address would be game-specific)
    -- current_lives = memory.readbyte(0x075A) -- Example address for Mario lives
    
    if current_lives >= target_lives and not challenge_completed then
        challenge_completed = true
        local time_played = "08:15" -- This should be calculated from game time
        write_challenge_completion(current_lives, time_played)
    end
end

-- Run the check every frame
while true do
    check_challenge()
    emu.frameadvance()
end
