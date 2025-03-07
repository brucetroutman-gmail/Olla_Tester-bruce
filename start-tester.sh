#!/bin/bash

# Navigate to the project directory (adjust if needed)
# cd /path/to/ollama-tester

# Start the server in the background
echo "Starting the server on port 3022..."
npm start &

# Give the server a moment to start (2 seconds)
sleep 2

# Open the browser to http://localhost:3022/
echo "Opening browser to http://localhost:3022/..."
case "$(uname -s)" in
    Darwin)
        # macOS
        open "http://localhost:3022/"
        ;;
    Linux)
        # Linux
        xdg-open "http://localhost:3022/"
        ;;
    CYGWIN*|MINGW32*|MSYS*|MINGW*)
        # Windows (Git Bash or similar)
        start "http://localhost:3022/"
        ;;
    *)
        echo "Unsupported OS. Please open http://localhost:3022/ manually."
        ;;
esac

# Keep the script running
wait