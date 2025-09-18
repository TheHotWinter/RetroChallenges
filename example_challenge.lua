-- Example Lua script for NES Challenges
-- This script demonstrates how to write challenge data to JSON

local json_file_path = "challenge_data.json"

-- Example challenge data structure (updated format with Date field)
local challenge_data = {
    username = "player123",
    score = 15000,
    time = "02:30",
    game = "Super Mario Bros",
    challengeName = "Speed Run Level 1",
    date = "2024-01-15T10:30:00.000Z"  -- ISO 8601 format
}

-- Function to write JSON data
function write_challenge_data(data)
    local json_string = string.format([[
{
    "username": "%s",
    "score": %d,
    "time": "%s",
    "game": "%s",
    "challengeName": "%s",
    "date": "%s"
}]], 
        data.username,
        data.score,
        data.time,
        data.game,
        data.challengeName,
        data.date
    )
    
    -- Write to file (this would be implemented based on your Lua environment)
    -- For EmuHawk, you might use console.log or other methods
    console.log("Challenge completed: " .. json_string)
end

-- Example: Call this when challenge is completed
-- write_challenge_data(challenge_data)

-- Note: The actual implementation depends on your EmuHawk Lua environment
-- You may need to use different methods to write files or output data
-- This is just an example of the expected JSON format

-- Example for Castlevania 5000 points challenge
local castlevania_data = {
    username = "player123",
    score = 5000,
    time = "05:45",
    game = "Castlevania",
    challengeName = "Get 5000 points!",
    date = "2024-01-15T10:30:00.000Z"
}

-- Example for Mario 5 1ups challenge
local mario_data = {
    username = "player123",
    score = 0,  -- Score might not be relevant for this challenge
    time = "03:20",
    game = "Super Mario Bros",
    challengeName = "Get 5 1ups!",
    date = "2024-01-15T10:30:00.000Z"
}
