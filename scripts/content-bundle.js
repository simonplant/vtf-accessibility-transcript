const fs = require('fs');
const path = require('path');

console.log('Bundling content script...');

// Read the content script and all modules
const contentScript = fs.readFileSync('src/content.js', 'utf8');

// Module order matters - dependencies first
const moduleFiles = [
  'vtf-globals-finder.js',
  'vtf-stream-monitor.js', 
  'vtf-state-monitor.js',
  'vtf-audio-worklet-node.js',
  'audio-data-transfer.js',
  'vtf-audio-capture.js'
];

// Start with an IIFE wrapper
let bundled = '(function() {\n"use strict";\n\n';

// Process each module
moduleFiles.forEach(file => {
  console.log(`Processing ${file}...`);
  let moduleContent = fs.readFileSync(`src/modules/${file}`, 'utf8');
  
  // Remove all import/export statements
  moduleContent = moduleContent
    // Remove import statements
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
    // Remove export statements but keep the class/function
    .replace(/^export\s+(default\s+)?(class|function|const|let|var)/gm, '$2')
    // Remove export { ... } statements
    .replace(/^export\s*\{[^}]*\};\s*$/gm, '')
    // Remove standalone export default
    .replace(/^export\s+default\s+(\w+);\s*$/gm, '');
  
  bundled += `// ===== ${file} =====\n${moduleContent}\n\n`;
});

// Now process the main content script
let mainContent = contentScript
  // Remove import statements
  .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
  // Remove export statements
  .replace(/^export\s+.*?$/gm, '');

// Replace the class instantiation since we removed the imports
mainContent = mainContent.replace(
  'window.vtfExtension = new VTFAudioExtension();',
  `// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

async function initializeExtension() {
  console.log('[VTF Extension] DOM ready, starting initialization');
  
  // Create global instance for debugging
  window.vtfExtension = new VTFAudioExtension();
  
  try {
    await window.vtfExtension.init();
  } catch (error) {
    console.error('[VTF Extension] Failed to initialize:', error);
  }
}`
);

bundled += `// ===== Main Content Script =====\n${mainContent}\n\n`;

// Close the IIFE
bundled += '})();';

// Write the bundled file
fs.writeFileSync('src/content-bundled.js', bundled);
console.log('Bundle created: src/content-bundled.js');

// Also create a minimal test version
const testContent = `
console.log('[VTF Extension] Content script loaded successfully!');

// Quick test to see if we're on VTF
if (window.location.hostname.includes('vtf.t3live.com')) {
  console.log('[VTF Extension] Detected VTF page');
  
  // Simple message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[VTF Extension] Received message:', request.type);
    
    if (request.type === 'getStatus') {
      sendResponse({
        initialized: true,
        capturing: false,
        onVTFPage: true
      });
    }
    
    return true;
  });
}
`;

fs.writeFileSync('src/content-test.js', testContent);
console.log('Test content script created: src/content-test.js');