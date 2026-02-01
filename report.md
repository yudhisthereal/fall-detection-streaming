# Canvas Rendering Architecture Investigation Report

## Working Architecture
The current working system uses a "Two-Pass Rendering" strategy:
1.  **`streamDisplay.js`**: The main rendering engine.
    *   **Background**: Uses a static `<img>` (`streamBackgroundImg`) for the video feed.
    *   **Overlays**: Uses a single transparent `<canvas>` (`streamCanvas`) layered on top.
    *   **Logic**: Polls for data (skeletons, areas) and only redraws the overlay when data changes.
    *   **Integrations**: Handles Safe/Bed/Floor areas and Skeletons (Pose) in one unified loop.
2.  **`editableAreaEditor.js`**: The editor module.
    *   **Canvas**: Uses its own isolated `<canvas>` (`editableAreaCanvas`) inside a popup.
    *   **Logic**: Captures a snapshot of the stream for background and handles polygon editing interaction.

## Identified Issues & Unused Scripts

### 1. Legacy/Redundant Scripts
The following scripts appear to be legacy implementations that are no longer functional or needed:

*   **`editableAreaDisplay.js`**
    *   **Purpose**: Was used to render safe areas on a separate `staticCanvas`.
    *   **Status**: **Broken/Inactive**. It attempts to find `id="staticCanvas"`, which no longer exists in `Index.cshtml`.
    *   **Conflict**: `streamDisplay.js` now handles rendering these areas on `streamCanvas`.
    *   **References**: Still loaded in `Index.cshtml` and called by `uiControls.js` (see below).

*   **`skeletonDisplay.js`**
    *   **Purpose**: Was used to render skeletons on a separate `skeletonCanvas`.
    *   **Status**: **Broken/Inactive**. It attempts to find `id="skeletonCanvas"`, which no longer exists in `Index.cshtml`.
    *   **Conflict**: `streamDisplay.js` now handles rendering skeletons on `streamCanvas`.
    *   **References**: Still loaded in `Index.cshtml`.

*   **`poseDisplay.js`**
    *   **Purpose**: Creates a floating `<div>` to show pose text info.
    *   **Status**: **Likely Unused**. While it creates its own DOM element, it is **never called** by the main controllers (`script.js`, `streamController.js`, `uiControls.js`).
    *   **Conflict**: `streamDisplay.js` renders pose labels directly on the canvas next to the skeleton.

### 2. Dead Code in `uiControls.js`
`uiControls.js` still contains logic trying to update the legacy scripts:
```javascript
// Example in uiControls.js
if (window.EditableAreaDisplay) {
    window.EditableAreaDisplay.update();
}
```
These calls are currently harmless (as the modules abort early due to missing canvas) but add confusion.

### 3. DOM Pollution in `Index.cshtml`
The `Index.cshtml` file loads all these scripts, polluting the global namespace:
```html
<script src="~/js/editableAreaDisplay.js" defer></script>
<script src="~/js/skeletonDisplay.js" defer></script>
<script src="~/js/poseDisplay.js" defer></script>
```

## Recommendations
1.  **Remove** `<script>` tags for the 3 legacy files from `Index.cshtml`.
2.  **Delete** `editableAreaDisplay.js`, `skeletonDisplay.js`, and `poseDisplay.js`.
3.  **Clean up** `uiControls.js` to remove calls to `window.EditableAreaDisplay`.
