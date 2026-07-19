import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // 상대 경로 → 저장소 이름과 무관하게 GitHub Pages에서 동작
})
