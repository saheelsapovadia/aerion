// If building for production but running locally (e.g. via backend serving 'public'),
// we should use the current origin instead of the hardcoded remote URL.
const isLocalhost = 
  typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL = 
  import.meta.env.VITE_API_URL || 
  (import.meta.env.DEV || isLocalhost ? 'http://localhost:3001' : 'https://aerion.onrender.com');

