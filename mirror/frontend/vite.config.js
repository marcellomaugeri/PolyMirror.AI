import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Point to the parent directory to find the .env file
  envDir: path.resolve(__dirname, '..'),
  server: {
    // Standardize the port for the frontend
    port: 3000,
  },
})
