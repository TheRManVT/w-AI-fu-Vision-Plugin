/**
 * Vision Plugin - Final Fixed Version
 * - Non-blocking BMP conversion
 * - External prompt configuration
 * - Both webcam and screenshot trigger AI responses
 */

const screenshot = require("screenshot-desktop");
const NodeWebcam = require("node-webcam");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// Global state variables
let logger = { print: (..._) => {}, warn: (..._) => {}, debug: (..._) => {} };
let wAIfu = {};
let webcam = null;
let isProcessingVision = false;
let lastVisionTimestamp = 0;
const VISION_COOLDOWN = 10000; // 10 second cooldown

/** @type { string[] } */
const inputQueue = [];

// Configuration
const WAKE_PHRASES = {
    WEBCAM: ["look at me", "see me", "check my webcam", "what do you see"],
    SCREENSHOT: ["look at screen", "see my screen", "check my screen", "what's on screen", "look at my screen"]
};

const VISION_CONFIG = {
    provider: "openai",
    model: "gpt-4o-mini",
    api_key: null,
    endpoint: "https://api.openai.com/v1/chat/completions",
    max_tokens: 500
};

const webcamOpts = {
    width: 1280,
    height: 720,
    quality: 100,
    delay: 0,
    saveShots: true,
    output: "bmp",
    device: 2,
    callbackReturn: "location",
    verbose: false
};

// Prompts - will be loaded from files
let PROMPTS = {
    webcam_analysis: "Describe what you see in this webcam image. Focus on the person, their appearance, expression, and any notable details. Be concise but descriptive.",
    screenshot_analysis: "Describe what you see on this screen. Focus on the application, its content, and text. Be concise but descriptive.",
    webcam_context: "User asked you to look at them through webcam.",
    screenshot_context: "User asked you to look at his screen."
};

/**
 * Load prompts from external files
 */
function loadPrompts() {
    const promptsDir = path.join(__dirname, "prompts");
    
    if (!fs.existsSync(promptsDir)) {
        logger.print("Vision Plugin: Creating prompts directory with defaults");
        fs.mkdirSync(promptsDir, { recursive: true });
        
        // Create default prompt files
        fs.writeFileSync(
            path.join(promptsDir, "webcam_analysis.txt"),
            PROMPTS.webcam_analysis
        );
        fs.writeFileSync(
            path.join(promptsDir, "screenshot_analysis.txt"),
            PROMPTS.screenshot_analysis
        );
        fs.writeFileSync(
            path.join(promptsDir, "webcam_context.txt"),
            PROMPTS.webcam_context
        );
        fs.writeFileSync(
            path.join(promptsDir, "screenshot_context.txt"),
            PROMPTS.screenshot_context
        );
        
        logger.print("Vision Plugin: Default prompt files created");
        return;
    }
    
    // Load prompts from files
    try {
        const files = {
            webcam_analysis: path.join(promptsDir, "webcam_analysis.txt"),
            screenshot_analysis: path.join(promptsDir, "screenshot_analysis.txt"),
            webcam_context: path.join(promptsDir, "webcam_context.txt"),
            screenshot_context: path.join(promptsDir, "screenshot_context.txt")
        };
        
        for (let [key, filepath] of Object.entries(files)) {
            if (fs.existsSync(filepath)) {
                PROMPTS[key] = fs.readFileSync(filepath, 'utf8').trim();
                logger.debug(`Vision Plugin: Loaded prompt: ${key}`);
            }
        }
        
        logger.print("Vision Plugin: Custom prompts loaded");
    } catch (err) {
        logger.warn("Vision Plugin: Failed to load custom prompts:", err.message);
    }
}

/**
 * Plugin initialization
 */
exports.onLoad = (passed_logger, passed_waifu) => {
    logger = passed_logger;
    wAIfu = passed_waifu;
    
    webcam = NodeWebcam.create(webcamOpts);
    
    try {
        const auth = JSON.parse(
            fs.readFileSync(process.cwd() + "/userdata/auth/auth.json")
        );
        VISION_CONFIG.api_key = auth.openai?.token || auth.vision_api_key;
        logger.print("Vision Plugin: Loaded successfully");
        logger.print("Vision Plugin: Wake phrases enabled for text/speech input");
        logger.print("Vision Plugin: Manual commands: !webcam, !screenshot");
        
        // Load custom prompts
        loadPrompts();
        
    } catch (err) {
        logger.warn("Vision Plugin: Failed to load API key:", err);
    }
};

/**
 * Detect wake phrases in message
 */
function detectWakePhrase(message) {
    if (!message) return null;
    const lower = message.toLowerCase();
    
    for (let phrase of WAKE_PHRASES.WEBCAM) {
        if (lower.includes(phrase)) {
            return "webcam";
        }
    }
    
    for (let phrase of WAKE_PHRASES.SCREENSHOT) {
        if (lower.includes(phrase)) {
            return "screenshot";
        }
    }
    
    return null;
}

/**
 * Capture webcam image and convert BMP to PNG (non-blocking)
 */
async function captureWebcam() {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const bmpFilename = path.join(process.cwd(), "userdata", "temp", `webcam_${timestamp}.bmp`);
        
        const tempDir = path.join(process.cwd(), "userdata", "temp");
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        webcam.capture(bmpFilename, (err, data) => {
            if (err) {
                logger.warn("Vision Plugin: Webcam capture failed:", err);
                reject(err);
                return;
            }
            
            logger.print("Vision Plugin: Webcam captured (BMP), converting to PNG...");
            
            const pngFilename = bmpFilename.replace('.bmp', '.png');
            const convertScript = path.join(__dirname, 'convert_bmp.py');
            
            // Use exec (non-blocking) instead of execSync
            exec(`python "${convertScript}" "${bmpFilename}" "${pngFilename}"`, (error, stdout, stderr) => {
                if (error) {
                    logger.warn("Vision Plugin: Conversion failed:", error.message);
                    reject(error);
                    return;
                }
                
                logger.print("Vision Plugin: Converted to PNG successfully");
                
                // Delete BMP
                try {
                    fs.unlinkSync(bmpFilename);
                } catch (e) {
                    // Ignore
                }
                
                // Save permanent copy
                try {
                    const permanentDir = path.join(process.cwd(), "userdata", "saved");
                    if (!fs.existsSync(permanentDir)) {
                        fs.mkdirSync(permanentDir, { recursive: true });
                    }
                    fs.copyFileSync(pngFilename, path.join(permanentDir, path.basename(pngFilename)));
                } catch (copyErr) {
                    // Ignore
                }
                
                resolve(pngFilename);
            });
        });
    });
}

/**
 * Capture screenshot
 */
async function captureScreenshot() {
    const timestamp = Date.now();
    const filename = path.join(process.cwd(), "userdata", "temp", `screenshot_${timestamp}.png`);
    
    const tempDir = path.join(process.cwd(), "userdata", "temp");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    try {
        const imgBuffer = await screenshot();
        fs.writeFileSync(filename, imgBuffer);
        logger.print("Vision Plugin: Screenshot captured");
        
        // Save permanent copy
        try {
            const permanentDir = path.join(process.cwd(), "userdata", "saved");
            if (!fs.existsSync(permanentDir)) {
                fs.mkdirSync(permanentDir, { recursive: true });
            }
            fs.copyFileSync(filename, path.join(permanentDir, path.basename(filename)));
        } catch (copyErr) {
            // Ignore
        }
        
        return filename;
    } catch (err) {
        logger.warn("Vision Plugin: Screenshot capture failed:", err);
        throw err;
    }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        default:
            return "image/png";
    }
}

/**
 * Analyze image with vision model
 */
async function analyzeImage(imagePath, type) {
    try {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }
        
        const buffer = fs.readFileSync(imagePath);
        const base64Image = buffer.toString('base64');
        const mimeType = getMimeType(imagePath);
        const imageUrl = `data:${mimeType};base64,${base64Image}`;
        
        logger.debug("Vision Plugin: Analyzing image...");
        logger.debug("  - MIME:", mimeType);
        logger.debug("  - Size:", (buffer.length / 1024).toFixed(2), "KB");
        
        // Use prompt from config
        const prompt = type === "webcam" 
            ? PROMPTS.webcam_analysis
            : PROMPTS.screenshot_analysis;
        
        const response = await axios.post(
            VISION_CONFIG.endpoint,
            {
                model: VISION_CONFIG.model,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: { url: imageUrl }
                            }
                        ]
                    }
                ],
                max_tokens: VISION_CONFIG.max_tokens
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${VISION_CONFIG.api_key}`
                }
            }
        );
        
        const description = response.data.choices[0].message.content;
        logger.print("Vision Plugin: Image analyzed successfully");
        logger.print("Vision Plugin: Description:", description.slice(0, 100) + "...");
        
        // Clean up temp file
        try {
            fs.unlinkSync(imagePath);
            logger.debug("Vision Plugin: Temp file deleted");
        } catch (err) {
            // Ignore
        }
        
        return description;
        
    } catch (err) {
        logger.warn("Vision Plugin: Vision API call failed:", err.message);
        if (err.response) {
            logger.warn("Vision Plugin: API Error:", JSON.stringify(err.response.data, null, 2));
        }
        throw err;
    }
}

/**
 * Process vision request
 */
async function processVisionRequest(type, userName) {
    if (!userName) {
        userName = "User";
    }
    
    if (isProcessingVision) {
        logger.warn("Vision Plugin: Already processing a vision request");
        return null;
    }
    
    isProcessingVision = true;
    wAIfu.state.prevent_ext_input = true;
    
    try {
        logger.print(`Vision Plugin: Processing ${type} request from ${userName}...`);
        
        // Capture image
        const imagePath = type === "webcam" 
            ? await captureWebcam() 
            : await captureScreenshot();
        
        // Analyze image
        const description = await analyzeImage(imagePath, type);
        
        // Get context from prompts
        const contextPrefix = type === "webcam"
            ? PROMPTS.webcam_context
            : PROMPTS.screenshot_context;
        
        // Create context message for AI memory
        const contextMessage = `[VISION] ${contextPrefix} What you see: ${description}`;
        
        // Add to AI memory
        if (wAIfu.state?.memory?.addMemory) {
            wAIfu.state.memory.addMemory(contextMessage);
            logger.print("Vision Plugin: Context added to memory");
        }
        
        // Queue response command to make AI respond immediately
        inputQueue.push(`${description}`);
        logger.print("Vision Plugin: Response queued");
        
        logger.print("Vision Plugin: Vision request completed");
        
        return description;
        
    } catch (err) {
        logger.warn("Vision Plugin: Vision processing failed:", err.message);
        return null;
        
    } finally {
        isProcessingVision = false;
        wAIfu.state.prevent_ext_input = false;
    }
}

/**
 * Command handler with wake phrase detection
 */
exports.onHandleCommand = async (command, trusted) => {
    // Check for manual commands first
    if (command.startsWith("!webcam")) {
        await processVisionRequest("webcam", "User");
        return true;
    }
    
    if (command.startsWith("!screenshot")) {
        await processVisionRequest("screenshot", "User");
        return true;
    }
    
    if (command.startsWith("!look at me") || command.startsWith("!see me")) {
        await processVisionRequest("webcam", "User");
        return true;
    }
    
    if (command.startsWith("!look at screen") || command.startsWith("!look at my screen")) {
        await processVisionRequest("screenshot", "User");
        return true;
    }
    
    if (command.startsWith("!vision-reload-prompts")) {
        loadPrompts();
        logger.print("Vision Plugin: Prompts reloaded");
        return true;
    }
    
    if (command.startsWith("!vision-test")) {
        logger.print("=".repeat(50));
        logger.print("Vision Plugin Status:");
        logger.print("  - Model:", VISION_CONFIG.model);
        logger.print("  - API Key:", VISION_CONFIG.api_key ? "Set" : "Not set");
        logger.print("  - Camera Device:", webcamOpts.device);
        logger.print("  - Camera Output:", webcamOpts.output);
        logger.print("  - Processing:", isProcessingVision);
        logger.print("  - Last Vision:", new Date(lastVisionTimestamp).toLocaleTimeString());
        logger.print("  - Cooldown:", VISION_COOLDOWN / 1000, "seconds");
        logger.print("  - Memory API:", wAIfu.state?.memory?.addMemory ? "Available" : "Not available");
        logger.print("Wake Phrases:");
        logger.print("  Webcam:", WAKE_PHRASES.WEBCAM.join(", "));
        logger.print("  Screenshot:", WAKE_PHRASES.SCREENSHOT.join(", "));
        logger.print("Custom Prompts:");
        logger.print("  - Webcam Analysis:", PROMPTS.webcam_analysis.slice(0, 50) + "...");
        logger.print("  - Screenshot Analysis:", PROMPTS.screenshot_analysis.slice(0, 50) + "...");
        logger.print("=".repeat(50));
        return true;
    }
    
    // Detect wake phrases in non-command input
    if (!command.startsWith("!") && !command.startsWith("[VISION")) {
        const now = Date.now();
        const timeSinceLastVision = now - lastVisionTimestamp;
        
        // Check cooldown
        if (timeSinceLastVision < VISION_COOLDOWN) {
            logger.debug(`Vision Plugin: Cooldown active (${((VISION_COOLDOWN - timeSinceLastVision) / 1000).toFixed(1)}s remaining)`);
            return false;
        }
        
        // Check for wake phrases
        const wakeType = detectWakePhrase(command);
        if (wakeType) {
            logger.print(`Vision Plugin: Wake phrase detected: "${command.slice(0, 50)}..."`);
            logger.print(`Vision Plugin: Triggering ${wakeType} vision...`);
            
            // Set timestamp BEFORE processing
            lastVisionTimestamp = now;
            
            // Process vision SYNCHRONOUSLY
            const description = await processVisionRequest(wakeType, "User");
            
            // Return true to consume the wake phrase message
            // The AI will respond to the queued !say command instead
            return true;
        }
    }
    
    return false;
};

/**
 * Response handler
 */
exports.onResponse = (response) => {
    return undefined;
};

/**
 * Input request hook
 */
exports.onInputRequest = () => {
    if (inputQueue.length === 0) return undefined;
    const item = inputQueue.shift();
    while (inputQueue.length > 0) inputQueue.pop();
    return item;
};

/**
 * Twitch reward handler
 */
exports.onTwitchRewardRedeem = (reward_name, user_name) => {
    logger.print(`Vision Plugin: Twitch reward "${reward_name}" by ${user_name}`);
    
    if (reward_name === "Show me your face" || reward_name === "Look at chat" || reward_name === "AI looks at you") {
        processVisionRequest("webcam", user_name);
    } else if (reward_name === "Show me your screen" || reward_name === "What are you doing?" || reward_name === "AI looks at screen") {
        processVisionRequest("screenshot", user_name);
    }
};

/**
 * Cleanup on quit
 */
exports.onQuit = () => {
    try {
        const tempDir = path.join(process.cwd(), "userdata", "temp");
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            for (let file of files) {
                if (file.startsWith("webcam_") || file.startsWith("screenshot_")) {
                    try {
                        fs.unlinkSync(path.join(tempDir, file));
                    } catch (e) {
                        // Ignore
                    }
                }
            }
        }
        logger.print("Vision Plugin: Cleanup complete");
    } catch (err) {
        logger.warn("Vision Plugin: Cleanup failed:", err);
    }

};
