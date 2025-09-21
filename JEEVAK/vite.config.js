import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// --- ACTION REQUIRED ---
// Replace the placeholder with your Raspberry Pi's actual IP address
const PI_IP_ADDRESS = '192.168.74.89'; 

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0', // This makes it accessible on your network
    proxy: {
      // Any request to these paths will be forwarded to the Pi
      '/predict': {
        target: `http://${PI_IP_ADDRESS}:5175`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://${PI_IP_ADDRESS}:5175`,
        changeOrigin: true,
      },
      // --- ADDED THIS SECTION FOR THE CHATBOT ---
      '/chat': { 
        target: `http://${PI_IP_ADDRESS}:5175`,
        changeOrigin: true,
      }
    }
  }
})
