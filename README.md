# Image to DXF Converter

AI 비전으로 도면 이미지를 AutoCAD 호환 DXF 파일로 자동 변환하는 웹 애플리케이션입니다.

**made by KSN**

---

## 주요 기능

- 이미지 파일(PNG, JPG, BMP, TIFF) 업로드 (드래그 앤 드롭 지원)
- LLM 비전으로 도면 요소(직선, 곡선, 치수, 텍스트) 자동 인식
- 표준 레이어 구조(4ELE, 2SEC, DIM, TEXT)로 DXF 파일 생성
  - 직선 → LINE 엔티티
  - 곡선/호 → LWPOLYLINE 엔티티
- 변환된 DXF 파일 즉시 다운로드
- 변환 이력 관리 (localStorage 기반)

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18, Vite |
| 백엔드 | Node.js, Express |
| DXF 생성 | @tarikjabiri/dxf |
| AI 분석 | LLM Vision API (Claude) |
| 스타일 | 순수 CSS (다크 테마) |
| DB | 없음 (localStorage 이력) |

---

## 설치 및 실행

### 사전 요구사항

- Node.js 18 이상
- npm 또는 pnpm

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
# 서버 + 클라이언트 동시 실행
npm run dev
```

- 프론트엔드: http://localhost:5173
- 백엔드 API: http://localhost:3001

### 프로덕션 빌드

```bash
# 프론트엔드 빌드
npm run build

# 서버 실행 (빌드된 파일 서빙)
npm start
```

---

## 환경 변수 설정 (선택)

LLM API를 사용하려면 `.env` 파일을 생성하세요:

```env
# Manus 내장 LLM API
BUILT_IN_FORGE_API_URL=https://...
BUILT_IN_FORGE_API_KEY=your-api-key

# 또는 직접 API 키 설정
LLM_API_URL=https://api.anthropic.com
LLM_API_KEY=your-anthropic-key
```

API 키가 없으면 기본 측정값(철근 정착길이 도면 기준)으로 DXF를 생성합니다.

---

## 프로젝트 구조

```
image-to-dxf/
├── server/
│   ├── index.js          # Express 서버 (API 엔드포인트)
│   └── dxfBuilder.js     # DXF 생성 로직
├── client/
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       └── pages/
│           └── Home.jsx  # 메인 UI
├── package.json
├── vite.config.js
└── README.md
```

---

## GitHub 배포

```bash
git init
git add .
git commit -m "feat: Image to DXF Converter"
git branch -M main
git remote add origin https://github.com/[계정]/[레포명].git
git push -u origin main
```

---

## 라이선스

MIT
