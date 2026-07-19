import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/image-to-dxf/',  // GitHub Pages 레포지토리 이름에 맞게 설정
})
