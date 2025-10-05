# w-AI-fu Vision Plugin

A vision plugin for w-AI-fu_v2 that enables AI VTubers to see through webcam or screenshots using GPT-4 Vision API. Supports natural wake phrases in speech/text input and Twitch channel point integration(not tested).

## Features

- 🎥 **Webcam capture** - AI can see you through your camera
- 🖥️ **Screenshot capture** - AI can see your screen
- 🗣️ **Wake phrase detection** - Natural language triggers like "look at me" or "look at my screen"
- 🎮 **Twitch integration** - Channel point rewards for viewer interaction
- ⚙️ **Customizable prompts** - Edit vision analysis behavior via text files
- 🚫 **Anti-loop protection** - 10-second cooldown prevents infinite vision triggers
- 💾 **Automatic image saving** - Keeps permanent copies of captures

## Requirements

- **w-AI-fu v2** 
- **Node.js v19.8.1** (w-AI-fu requirement)
- **Python 3.10.11** (w-AI-fu requirement)
- **OpenAI API key** with GPT-4 Vision access

## Installation

### 1. Install Node.js Dependencies
```bash
cd w-AI-fu_v2
npm install screenshot-desktop node-webcam axios
```

### 2. Install Python Dependencies
```
pip install Pillow
```

### 3. Install Plugin
1) Download this repository
2) Copy the VisionPlugin folder to `<w-AI-fu_v2 root folder>/userdata/plugins/`
3) Your structure should look like:
```
   w-AI-fu_v2/
   └── userdata/
       └── plugins/
           └── VisionPlugin/
               ├── index.js
               ├── plugin.json
               ├── webcam_detector.js
               └── convert_bmp.py
```

### 4. Configure API Key
Add your OpenAI API key to `userdata/auth/auth.json`:
```
{
  "openai": {
    "token": "sk-proj-xxxxxxxxxxxxx"
  }
}
```

### 5. Configure Camera Index
Run the webcam detector to find your camera:
```
python webcam_detector.py
```
Then edit `index.js` line ~48:
```
device: 2,  // Change to your camera index
```

## Usage
### Wake Phrases (Natural Speech/Text)
#### Webcam:
- "Look at me"
- "See me"
- "Check my webcam"
- "What do you see?"

#### Screenshot:
- "Look at my screen"
- "See my screen"
- "Check my screen"
- "What's on screen?"

### Manual Commands
```
!webcam           # Capture and analyze webcam
!screenshot       # Capture and analyze screenshot
!vision-test      # Display plugin status
!vision-reload-prompts  # Reload custom prompts
```

## Customization
### Prompt Files
After first run, edit these files in `VisionPlugin/prompts/`:
```
webcam_analysis.txt - Instructions for analyzing webcam images
screenshot_analysis.txt - Instructions for analyzing screenshots
webcam_context.txt - Context message when looking at webcam
screenshot_context.txt - Context message when looking at screen
```
After editing, run `!vision-reload-prompts` or restart w-AI-fu.

### Wake Phrases
Edit `index.js` around line 28:
```
javascriptconst WAKE_PHRASES = {
    WEBCAM: ["look at me", "see me", /* add your phrases */],
    SCREENSHOT: ["look at screen", /* add your phrases */]
};
```
### Vision Model
Edit `index.js` around line 37:
```
javascriptconst VISION_CONFIG = {
    model: "gpt-4o-mini",  // Options: gpt-4o, gpt-4o-mini, gpt-4-turbo
    max_tokens: 500        // Adjust response length
};
```

### Cooldown Period
Edit `index.js` around line 16:
```
javascriptconst VISION_COOLDOWN = 10000; // milliseconds (10 seconds)
```

## How It Works
1) User says wake phrase or uses command
2) Plugin captures image (webcam converts BMP→PNG via Python)
3) Image sent to GPT-4 Vision API with custom prompt
4) Description returned and injected into AI memory
5) AI responds naturally about what it saw
6) 10-second cooldown prevents re-triggering

## Troubleshooting
### Webcam Not Working
- Run `python webcam_detector.py` to find camera index
- Check no other apps are using camera (OBS, Zoom, Teams)
- Update `device:` value in `index.js`
- Verify `convert_bmp.py` exists in plugin folder

### API Errors (400/401)
- `400 "unsupported image format"`: BMP conversion failed, check Python/Pillow installed
- `401 "unauthorized"`: Check API key in auth.json
- `404 "model not found"`: Update model name to gpt-4o-mini

### Vision Triggers Multiple Times
- Check cooldown is set (default 10 seconds)
- Verify plugin doesn't detect own messages (shouldn't start with [VISION)

### Screenshot Works But Webcam Doesn't
- Webcam requires BMP→PNG conversion via Python
- Ensure Pillow is installed: `pip install Pillow`
- Check `convert_bmp.py` has execute permissions

### Performance Issues
Reduce image quality in `index.js`:
```
const webcamOpts = {
    width: 640,      // Lower resolution
    height: 480,
    quality: 80      // Lower quality
};
```
Use faster model:
```
model: "gpt-4o-mini"  // Cheaper and faster than gpt-4o
```

# NOTES
```
- I am not claiming to be the developer of w_AI_fu nor any other components needed to run this plugin.
- Only works with already downloaded w_AI_fu v2/w_AI_fu v2.R. No copies will be distrubed by the developer of this plugin nor the original developer of w_AI_fu
- This plugin was made in "collaboration" with Claude/Sonnet 4.5.
- This plugin has been tested with w_AI_fu v2 with slight modifications(none are in conflict with this plugin).
- Any issues, not outlined in "Troubleshooting", that can occur will not be fixed by neither myself nor the original developer of w_AI_fu
