/**
 * Webcam Device Detector for Windows
 * 
 * This script helps you identify all connected webcams and their indices.
 * Run with: node webcam_detector.js
 * 
 * It will:
 * 1. List all available webcam devices
 * 2. Take a test photo from each camera
 * 3. Save photos with camera index in filename
 * 4. Display device information
 */

const NodeWebcam = require("node-webcam");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// Output directory for test captures
const OUTPUT_DIR = path.join(process.cwd(), "webcam_test_captures");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log("=".repeat(60));
console.log("WEBCAM DEVICE DETECTOR");
console.log("=".repeat(60));
console.log("");

/**
 * Test a webcam at specific index
 */
async function testWebcam(deviceIndex) {
    return new Promise((resolve, reject) => {
        const opts = {
            width: 1280,
            height: 720,
            quality: 100,
            delay: 0,
            saveShots: true,
            output: "jpeg",
            device: deviceIndex === 0 ? false : deviceIndex, // false for default camera
            callbackReturn: "location",
            verbose: false
        };

        const webcam = NodeWebcam.create(opts);
        const filename = path.join(OUTPUT_DIR, `camera_${deviceIndex}_test.jpg`);

        console.log(`Testing Camera Index ${deviceIndex}...`);

        webcam.capture(filename, (err, data) => {
            if (err) {
                console.log(`  ✗ Camera ${deviceIndex}: FAILED`);
                console.log(`    Error: ${err.message}`);
                resolve({ index: deviceIndex, available: false, error: err.message });
            } else {
                console.log(`  ✓ Camera ${deviceIndex}: SUCCESS`);
                console.log(`    Photo saved: ${filename}`);
                
                // Get file size
                const stats = fs.statSync(filename);
                const fileSizeKB = (stats.size / 1024).toFixed(2);
                console.log(`    File size: ${fileSizeKB} KB`);
                
                resolve({ 
                    index: deviceIndex, 
                    available: true, 
                    filename: filename,
                    fileSize: fileSizeKB 
                });
            }
        });
    });
}

/**
 * Get Windows camera list using PowerShell
 */
async function getWindowsCameraList() {
    return new Promise((resolve, reject) => {
        // PowerShell command to list video capture devices
        const psCommand = `
            Get-PnpDevice -Class Camera | 
            Select-Object FriendlyName, Status, InstanceId | 
            ConvertTo-Json
        `;

        exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
            if (error) {
                console.log("Note: PowerShell device enumeration failed, using fallback method");
                resolve([]);
                return;
            }

            try {
                const devices = JSON.parse(stdout);
                resolve(Array.isArray(devices) ? devices : [devices]);
            } catch (e) {
                resolve([]);
            }
        });
    });
}

/**
 * Main detection function
 */
async function detectWebcams() {
    console.log("Step 1: Detecting Windows camera devices...\n");
    
    const windowsDevices = await getWindowsCameraList();
    
    if (windowsDevices.length > 0) {
        console.log("Found Windows Camera Devices:");
        windowsDevices.forEach((device, idx) => {
            console.log(`  ${idx}: ${device.FriendlyName} (${device.Status})`);
        });
        console.log("");
    } else {
        console.log("Could not enumerate Windows devices directly.");
        console.log("Will test camera indices manually...\n");
    }

    console.log("Step 2: Testing camera indices (0-9)...\n");
    console.log("This may take a moment...\n");

    const results = [];
    const MAX_CAMERAS = 10; // Test indices 0-9

    for (let i = 0; i < MAX_CAMERAS; i++) {
        const result = await testWebcam(i);
        results.push(result);
        
        // Add small delay between attempts
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("\n" + "=".repeat(60));
    console.log("DETECTION RESULTS");
    console.log("=".repeat(60));
    console.log("");

    const availableCameras = results.filter(r => r.available);

    if (availableCameras.length === 0) {
        console.log("❌ No working cameras detected!");
        console.log("");
        console.log("Troubleshooting tips:");
        console.log("  1. Make sure your webcam is plugged in");
        console.log("  2. Check if another application is using the camera");
        console.log("  3. Try closing OBS, Zoom, Teams, or other camera apps");
        console.log("  4. Restart your computer");
        console.log("  5. Update your webcam drivers");
    } else {
        console.log(`✓ Found ${availableCameras.length} working camera(s):\n`);
        
        availableCameras.forEach((camera, idx) => {
            console.log(`Camera ${camera.index}:`);
            console.log(`  Status: Available ✓`);
            console.log(`  Test Image: ${camera.filename}`);
            console.log(`  File Size: ${camera.fileSize} KB`);
            
            // Try to match with Windows device
            if (windowsDevices[idx]) {
                console.log(`  Device Name: ${windowsDevices[idx].FriendlyName}`);
            }
            
            console.log("");
        });

        console.log("=".repeat(60));
        console.log("CONFIGURATION");
        console.log("=".repeat(60));
        console.log("");
        console.log("To use a specific camera in your plugin, set:");
        console.log("");
        console.log("const webcamOpts = {");
        console.log("    ...");
        availableCameras.forEach(camera => {
            console.log(`    device: ${camera.index},  // Use this for Camera ${camera.index}`);
        });
        console.log("    ...");
        console.log("};");
        console.log("");
        
        if (availableCameras.length > 1) {
            console.log("You have multiple cameras. Common indices:");
            console.log("  - Index 0 or false: Usually built-in laptop webcam");
            console.log("  - Index 1+: External USB webcams");
            console.log("");
            console.log("Check the test images in:");
            console.log(`  ${OUTPUT_DIR}`);
            console.log("to see which camera is which!");
        }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("");
}

// Run the detector
detectWebcams().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});