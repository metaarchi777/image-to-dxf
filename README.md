# Image to DXF Converter

도면 이미지를 AutoCAD 호환 DXF 파일로 변환하는 웹 애플리케이션입니다.

**made by KSN**

---

## 주요 기능

- 이미지 파일(PNG, JPG, BMP, TIFF) 업로드 (드래그 앤 드롭 지원)
- 도면 요소 자동 인식 및 DXF 파일 생성
- DXF R12 형식 출력 → AutoCAD, LibreCAD, DraftSight 등 대부분의 CAD에서 호환
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

### 1. 코드 업로드 (중요!)

**⚠️ 웹 브라우저에서 드래그 앤 드롭으로 파일을 올리면 숨김 파일(`.github` 폴더, `.gitignore`)이 누락되어 배포가 안 됩니다.**
반드시 아래 방법 중 하나를 사용하세요.

**방법 A — Git 명령어 (권장):**

```bash
cd image-to-dxf-pages
git init
git add -A
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

**방법 B — GitHub Desktop:** 폴더를 열어서 커밋 후 Publish repository

업로드 후 저장소의 파일 목록에 `.github/workflows/deploy.yml` 이 보이는지 꼭 확인하세요.

### 2. Pages 설정

- 워크플로가 Pages를 자동으로 활성화하도록 설정되어 있습니다.
- 자동 활성화가 실패하는 경우에만 수동 설정: 저장소 → **Settings** → **Pages** → **Source** → **GitHub Actions** 선택

### 3. 배포 확인

- `main`(또는 `master`) 브랜치에 push하면 자동으로 빌드/배포됩니다.
- 저장소의 **Actions** 탭에서 진행 상태를 확인할 수 있습니다.
- 배포 완료 후 접속 주소: `https://<사용자명>.github.io/<저장소명>/`
- 저장소 이름은 아무거나 상관없습니다 (상대 경로 빌드라서 이름과 무관하게 동작).

---

## 문제 해결 (Troubleshooting)

| 증상 | 원인 | 해결 |
|------|------|------|
| Actions 탭에 워크플로가 없음 | `.github` 폴더가 업로드되지 않음 | 위의 방법 A/B로 다시 업로드 |
| Actions에서 `Failed to create deployment (404)` | Pages 미활성화 | Settings → Pages → Source → **GitHub Actions** 선택 후 Actions 탭에서 **Re-run jobs** |
| 페이지가 하얀 화면만 나옴 | 브라우저 캐시 | 강력 새로고침 (Ctrl+Shift+R) |
| 404 Not Found | 배포가 아직 진행 중 | Actions 탭에서 초록색 체크 표시 확인 후 1~2분 대기 |

---

## 로컬 실행

```bash
npm install
npm run dev
# http://localhost:5173/ 접속
```

---

## 라이선스

MIT
