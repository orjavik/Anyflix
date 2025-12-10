// Anyflix - Content script (runs in isolated world)
// This handles any cleanup that needs extension APIs

console.log('Anyflix: Content script loaded');

// Listen for messages from the page if needed
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'ANYFLIX_LOG') {
    console.log('Anyflix:', event.data.message);
  }
});
