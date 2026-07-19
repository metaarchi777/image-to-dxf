# Image to DXF Converter

도면 이미지를 AutoCAD 호환 DXF 파일로 변환하는 웹 애플리케이션입니다.

**made by KSN**

🌐 **배포 주소**: `https://metaarchi777.github.io/image-to-dxf/`

---

## 주요 기능

- 이미지 파일(PNG, JPG, BMP, TIFF) 업로드 (드래그 앤 드롭 지원)
- 도면 요소 자동 인식 및 DXF 파일 생성
- 표준 레이어 구조 (4ELE, 2SEC, DIM, TEXT)
- 변환된 DXF 파일 즉시 다운로드
- 변환 이력 관리 (브라우저 localStorage)
- 서버 없이 브라우저에서 직접 동작

---

## 기술 스택

- React 18 + Vite
- 순수 JavaScript DXF 생성 (서버 불필요)
- GitHub Pages 자동 배포 (GitHub Actions)

---

## GitHub Pages 배포 방법

### 1. 레포지토리 설정
1. GitHub 레포지토리 → **Settings** 탭 클릭
2. 왼쪽 메뉴 **Pages** 클릭
3. **Source** → **GitHub Actions** 선택
4. 저장

### 2. 자동 배포
`main` 브랜치에 push하면 자동으로 빌드 및 배포됩니다.

배포 완료 후 접속 주소:
```
https://metaarchi777.github.io/image-to-dxf/
```

---

## 로컬 실행

```bash
npm install
npm run dev
# http://localhost:5173/image-to-dxf/ 접속
```

---

## 라이선스

MIT
