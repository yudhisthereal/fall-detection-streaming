// poseInfoDisplay.js - Pose analysis display

const PoseInfoDisplay = {
    update(poseData) {
        let poseDisplay = document.getElementById('poseDisplay');
        
        // Create pose display if it doesn't exist
        if (!poseDisplay) {
            poseDisplay = document.createElement('div');
            poseDisplay.id = 'poseDisplay';
            poseDisplay.style.cssText = 'position: absolute; top: 100px; left: 20px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px; z-index: 1000;';
            document.body.appendChild(poseDisplay);
        }
        
        if (poseData && poseData.label) {
            poseDisplay.innerHTML = `
                <div><strong>Activity:</strong> ${poseData.label}</div>
                ${poseData.torso_angle ? `<div><strong>Torso Angle:</strong> ${poseData.torso_angle.toFixed(1)}°</div>` : ''}
                ${poseData.thigh_uprightness ? `<div><strong>Thigh Uprightness:</strong> ${poseData.thigh_uprightness.toFixed(1)}°</div>` : ''}
                ${poseData.fall_detected ? `<div style="color: red;"><strong>FALL DETECTED!</strong></div>` : ''}
            `;
            poseDisplay.style.display = 'block';
        } else {
            poseDisplay.style.display = 'none';
        }
    },

    hide() {
        const poseDisplay = document.getElementById('poseDisplay');
        if (poseDisplay) {
            poseDisplay.style.display = 'none';
        }
    }
};

// Export
window.PoseInfoDisplay = PoseInfoDisplay;

