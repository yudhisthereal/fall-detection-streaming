// algorithmInfo.js - Algorithm info panel

const AlgorithmInfo = {
    previousScrollPosition: 0,

    show() {
        // Store current scroll position
        this.previousScrollPosition = window.scrollY || document.documentElement.scrollTop;
        
        if (DOMElements.algorithmInfo) {
            DOMElements.algorithmInfo.style.display = 'block';
        }
        if (DOMElements.showInfoBtn) {
            DOMElements.showInfoBtn.style.display = 'none';
        }
        
        // Scroll to show the info panel
        setTimeout(() => {
            if (DOMElements.algorithmInfo) {
                DOMElements.algorithmInfo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    },

    hide() {
        if (DOMElements.algorithmInfo) {
            DOMElements.algorithmInfo.style.display = 'none';
        }
        if (DOMElements.showInfoBtn) {
            DOMElements.showInfoBtn.style.display = 'inline-block';
        }
        
        // Restore previous scroll position
        setTimeout(() => {
            window.scrollTo({
                top: this.previousScrollPosition,
                behavior: 'smooth'
            });
        }, 100);
    }
};

// Export
window.AlgorithmInfo = AlgorithmInfo;

