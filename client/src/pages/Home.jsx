import React, { useState, useRef, useEffect, useCallback } from 'react';

const STEPS = [
  { key: 'upload',    label: '업로드' },
  { key: 'analyzing', label: 'AI 분석' },
  { key: 'converting',label: 'DXF 변환' },
  { key: 'done',      label: '완료' },
];

const HISTORY_KEY = 'dxf_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
}

export default function Home() {
  const [status, setStatus]     = useState('idle'); // idle | uploading | analyzing | converting | done | error
  const [progress, setProgress] = useState(0);
  const [preview, setPreview]   = useState(null);   // 원본 이미지 미리보기 URL
  const [fileName, setFileName] = useState('');
  const [dxfBlob, setDxfBlob]   = useState(null);
  const [dxfName, setDxfName]   = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory]   = useState(loadHistory);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const currentStepIdx = STEPS.findIndex(s => s.key === status);

  // 파일 선택 처리
  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setErrorMsg('이미지 파일(PNG, JPG, BMP, TIFF)만 지원합니다.');
      return;
    }

    // 원본 미리보기
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setFileName(file.name);
    setDxfBlob(null);
    setDxfName('');
    setErrorMsg('');

    // 변환 시작
    await convertImage(file);
  }, []);

  const convertImage = async (file) => {
    try {
      // 1. 업로드 단계
      setStatus('uploading');
      setProgress(10);

      const formData = new FormData();
      formData.append('image', file);

      // 2. AI 분석 단계
      setStatus('analyzing');
      setProgress(35);

      // 3. 변환 단계
      setStatus('converting');
      setProgress(65);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '변환 실패' }));
        throw new Error(err.error || '서버 오류');
      }

      setProgress(90);

      // DXF 파일 수신
      const blob = await response.blob();
      const outName = response.headers.get('X-Filename') ||
                      file.name.replace(/\.[^.]+$/, '') + '_converted.dxf';

      setDxfBlob(blob);
      setDxfName(outName);
      setProgress(100);
      setStatus('done');

      // 이력 저장
      const entry = {
        id: Date.now(),
        fileName: file.name,
        dxfName: outName,
        convertedAt: new Date().toISOString(),
        blobUrl: URL.createObjectURL(blob),
      };
      const newHistory = [entry, ...loadHistory()];
      saveHistory(newHistory);
      setHistory(newHistory);

    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || '변환 중 오류가 발생했습니다.');
    }
  };

  // DXF 다운로드
  const downloadDxf = () => {
    if (!dxfBlob) return;
    const url = URL.createObjectURL(dxfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dxfName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 이력에서 다운로드
  const downloadFromHistory = (entry) => {
    const a = document.createElement('a');
    a.href = entry.blobUrl;
    a.download = entry.dxfName;
    a.click();
  };

  // 이력 삭제
  const clearHistory = () => {
    saveHistory([]);
    setHistory([]);
  };

  // 드래그 앤 드롭
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // 초기화
  const reset = () => {
    setStatus('idle');
    setProgress(0);
    setPreview(null);
    setFileName('');
    setDxfBlob(null);
    setDxfName('');
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isProcessing = ['uploading','analyzing','converting'].includes(status);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(13,17,23,0.8)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--gold)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, color: '#0d1117',
          }}>DX</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Image to DXF</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>AI-Powered CAD Converter</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {history.length > 0 && `변환 이력 ${history.length}건`}
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 960, margin: '0 auto', width: '100%', padding: '40px 24px' }}>

        {/* 히어로 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2, marginBottom: 12 }}>
            <span style={{ color: 'var(--gold)' }}>AI 비전</span>으로 도면을{' '}
            <span style={{ color: 'var(--gold)' }}>DXF</span>로 변환
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 520, margin: '0 auto' }}>
            이미지를 업로드하면 LLM이 도면 요소를 분석하고 AutoCAD 호환 DXF 파일을 자동 생성합니다.
          </p>
        </div>

        {/* 업로드 영역 */}
        {status === 'idle' && (
          <div
            className={`upload-zone${dragOver ? ' drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📐</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              이미지를 드래그하거나 클릭하여 업로드
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              PNG, JPG, BMP, TIFF 지원 · 최대 10MB
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        )}

        {/* 처리 중 / 완료 / 오류 */}
        {status !== 'idle' && (
          <div className="card" style={{ marginBottom: 24 }}>
            {/* 파일명 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🖼️</span>
                <span style={{ fontWeight: 500 }}>{fileName}</span>
              </div>
              {!isProcessing && (
                <button className="btn-secondary" onClick={reset} style={{ fontSize: 12, padding: '4px 12px' }}>
                  새 파일 변환
                </button>
              )}
            </div>

            {/* 단계 표시 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
              {STEPS.map((step, i) => {
                const isDone    = status === 'done' || (currentStepIdx > i);
                const isActive  = STEPS[currentStepIdx]?.key === step.key && status !== 'done' && status !== 'error';
                const isPending = !isDone && !isActive;
                return (
                  <React.Fragment key={step.key}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                      <div className={`step-dot ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <span style={{ fontSize: 11, color: isDone ? 'var(--success)' : isActive ? 'var(--gold)' : 'var(--text-dim)' }}>
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ flex: 1, height: 1, background: isDone ? 'var(--success)' : 'var(--border)', margin: '0 4px', marginBottom: 20 }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* 진행 바 */}
            {isProcessing && (
              <div style={{ marginBottom: 16 }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                  <div className="spinner" />
                  <span>
                    {status === 'uploading' && '이미지 업로드 중...'}
                    {status === 'analyzing' && 'AI가 도면 요소를 분석하는 중...'}
                    {status === 'converting' && 'DXF 파일 생성 중...'}
                  </span>
                </div>
              </div>
            )}

            {/* 오류 */}
            {status === 'error' && (
              <div style={{
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)',
                borderRadius: 6,
                padding: '12px 16px',
                color: 'var(--error)',
                fontSize: 13,
                marginBottom: 12,
              }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {/* 완료 - 원본 & 결과 나란히 */}
            {status === 'done' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {/* 원본 이미지 */}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>원본 이미지</div>
                    <div style={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      overflow: 'hidden',
                      aspectRatio: '4/3',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {preview && <img src={preview} alt="원본" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                    </div>
                  </div>
                  {/* DXF 변환 결과 정보 */}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>변환 결과</div>
                    <div style={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 20,
                      aspectRatio: '4/3',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12,
                    }}>
                      <div style={{ fontSize: 32, textAlign: 'center' }}>📄</div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{dxfName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>AutoCAD 호환 DXF 파일</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>
                          <div>✓ 레이어: 4ELE, 2SEC, DIM, TEXT, TXT1</div>
                          <div>✓ 직선: LINE 엔티티</div>
                          <div>✓ 곡선: LWPOLYLINE 엔티티</div>
                          <div>✓ 단위: mm (INSUNITS=4)</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 다운로드 버튼 */}
                <button className="btn-primary" onClick={downloadDxf} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
                  ⬇️ DXF 파일 다운로드
                </button>
              </div>
            )}
          </div>
        )}

        {/* 특징 카드 (idle 상태) */}
        {status === 'idle' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 32 }}>
            {[
              { icon: '🤖', title: 'LLM 비전 분석', desc: 'AI가 도면의 직선, 곡선, 치수, 텍스트를 정밀 인식합니다.' },
              { icon: '📐', title: '표준 레이어 구조', desc: '4ELE, 2SEC, DIM, TEXT 등 CAD 표준 레이어로 자동 분류합니다.' },
              { icon: '⬇️', title: '즉시 다운로드', desc: 'AutoCAD, LibreCAD 등 모든 CAD 소프트웨어와 호환됩니다.' },
            ].map(f => (
              <div key={f.title} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* 변환 이력 */}
        {history.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>변환 이력</h2>
              <button className="btn-secondary" onClick={clearHistory} style={{ fontSize: 11, padding: '4px 10px' }}>
                전체 삭제
              </button>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>파일명</th>
                    <th>변환 시각</th>
                    <th>DXF 파일명</th>
                    <th style={{ textAlign: 'right' }}>다운로드</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(entry => (
                    <tr key={entry.id}>
                      <td style={{ fontWeight: 500 }}>{entry.fileName}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(entry.convertedAt).toLocaleString('ko-KR')}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{entry.dxfName}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-secondary"
                          onClick={() => downloadFromHistory(entry)}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                        >
                          ⬇️ 다운로드
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 푸터 */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: 'var(--text-muted)',
      }}>
        <span>Image to DXF Converter · AI-Powered CAD Conversion</span>
        <span style={{ color: 'var(--gold)', fontWeight: 600, letterSpacing: '0.1em' }}>made by KSN</span>
      </footer>
    </div>
  );
}
