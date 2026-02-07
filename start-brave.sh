#!/bin/bash
# Quit any existing Brave
osascript -e 'quit app "Brave Browser"' 2>/dev/null
sleep 1

# Create preferences directory if needed
PROFILE_DIR="$HOME/brave-debug-profile"
PREFS_DIR="$PROFILE_DIR/Default"
mkdir -p "$PREFS_DIR"

# Create/update preferences to download PDFs instead of viewing them
cat > "$PREFS_DIR/Preferences" << 'EOF'
{
  "plugins": {
    "always_open_pdf_externally": true
  },
  "download": {
    "prompt_for_download": false,
    "default_directory": ""
  }
}
EOF

echo "Starting Brave with PDF auto-download enabled..."
echo "PDFs will download to ~/Downloads"

# Launch Brave with debug port
exec /Applications/Brave\ Browser.app/Contents/MacOS/Brave\ Browser \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR"
