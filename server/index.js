import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { buildDxfFromMeasurements, getDefaultMeasurements, parseLlmMeasurements } from './dxfBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── 미들웨어 ──
app.use(cors());
app.use(express.json());

// 빌드된 프론트엔드 서빙
const publicDir = path.join(__dirname, '../dist/public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ── 파일 업로드 설정 ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/bmp', 'image/tiff', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── LLM 분석 헬퍼 ──
async function analyzeImageWithLLM(imageBase64, mimeType) {
  const apiUrl = process.env.BUILT_IN_FORGE_API_URL || process.env.LLM_API_URL;
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY || process.env.LLM_API_KEY;

  if (!apiUrl || !apiKey) {
    console.log('[LLM] API 키 없음 - 기본 측정값 사용');
    return null;
  }

  const prompt = `이 도면 이미지를 분석하여 각 선의 픽셀 좌표를 정밀하게 측정하고 JSON으로 반환하세요.

이미지 크기를 먼저 파악하고, 다음 항목을 픽셀 단위로 측정하세요:
- imgW, imgH: 이미지 전체 크기
- boxLeft, boxRight, boxTop, boxBottom: 도면 외곽 사각형 좌표
- topRebarTop, topRebarBot: 상단 철근 2줄의 y좌표 (위, 아래)
- botRebarTop, botRebarMid, botRebarBot: 하단 철근 3줄의 y좌표
- hookHorizEnd: 갈고리 수평 끝 x좌표
- hookVertX: 갈고리 수직부 x좌표
- hookBottom: 갈고리 수직부 하단 y좌표
- stirrups: 수직 스터럽 쌍 배열 [[x1,x2], ...] (각 쌍의 좌우 x좌표)
- sectionLineX: 좌측 단면선 x좌표
- zzLeft, zzRight: 지그재그 좌우 x좌표
- zzTop, zzBottom, zzMidY: 지그재그 상단/하단/중간 y좌표
- dimTopY: 상단 치수선 y좌표
- dimArrowA_X, dimArrowB_X: l_dh 치수 화살표 x좌표
- dim3db_X1, dim3db_X2: 3db 치수 x좌표
- dim2db_X1, dim2db_X2: 2db 치수 x좌표
- secLineX: A-A 단면 위치선 x좌표

JSON만 반환하세요. 설명 없이 순수 JSON만.`;

  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) throw new Error(`LLM API 오류: ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[LLM] 분석 실패:', err.message);
    return null;
  }
}

// ── API 엔드포인트 ──

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// 이미지 → DXF 변환
app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }

    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // 1단계: LLM으로 이미지 분석
    let measurements = null;
    try {
      const llmResult = await analyzeImageWithLLM(imageBase64, mimeType);
      measurements = parseLlmMeasurements(llmResult);
    } catch (e) {
      console.log('[Convert] LLM 분석 실패, 기본값 사용');
    }

    // 2단계: 측정값 없으면 기본값 사용
    if (!measurements) {
      measurements = getDefaultMeasurements();
    }

    // 3단계: DXF 생성
    const dxfContent = buildDxfFromMeasurements(measurements);

    // 4단계: DXF 파일로 응답
    const filename = `converted_${Date.now()}.dxf`;
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Filename', filename);
    res.send(dxfContent);

  } catch (err) {
    console.error('[Convert] 오류:', err);
    res.status(500).json({ error: '변환 중 오류가 발생했습니다.' });
  }
});

// SPA 폴백
app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
