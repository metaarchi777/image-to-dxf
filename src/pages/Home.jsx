import { useState, useRef, useCallback } from 'react'
import { generateDxfFromImage } from '../dxfBuilder.js'

const STEPS = ['업로드', '문자 인식·분석', '변환', '완료']

function ProgressBar({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '24px 0' }}>
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: done ? '#d4a843' : active ? '#d4a843' : '#21262d',
                border: `2px solid ${done || active ? '#d4a843' : '#30363d'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
                color: done || active ? '#0d1117' : '#6e7681',
                transition: 'all 0.3s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: done || active ? '#d4a843' : '#6e7681', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 8px', marginBottom: 18,
                background: done ? '#d4a843' : '#30363d',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function UploadZone({ onFile, dragging, setDragging }) {
  const inputRef = useRef()

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onFile(file)
  }, [onFile, setDragging])

  const handleChange = (e) => {
    const file = e.target.files[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? '#d4a843' : '#30363d'}`,
        borderRadius: 12,
        padding: '48px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(212,168,67,0.05)' : '#161b22',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📐</div>
      <p style={{ color: '#e6edf3', fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
        도면 이미지를 여기에 드래그하거나 클릭하여 업로드
      </p>
      <p style={{ color: '#6e7681', fontSize: 13 }}>
        PNG, JPG, BMP, TIFF 지원
      </p>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChange} />
    </div>
  )
}

function HistoryItem({ item, onDownload }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', background: '#161b22', borderRadius: 8,
      border: '1px solid #30363d', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>📄</span>
        <div>
          <p style={{ color: '#e6edf3', fontSize: 14, fontWeight: 500 }}>{item.fileName}</p>
          <p style={{ color: '#6e7681', fontSize: 12 }}>{item.convertedAt}</p>
        </div>
      </div>
      <button
        onClick={() => onDownload(item)}
        style={{
          background: 'transparent', border: '1px solid #d4a843',
          color: '#d4a843', borderRadius: 6, padding: '6px 14px',
          fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(212,168,67,0.1)' }}
        onMouseLeave={e => { e.target.style.background = 'transparent' }}
      >
        ↓ DXF 다운로드
      </button>
    </div>
  )
}

export default function Home() {
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dxf-history') || '[]') }
    catch { return [] }
  })
  const [previewUrl, setPreviewUrl] = useState(null)

  const handleFile = async (file) => {
    setProcessing(true)
    setResult(null)
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })

    // 1단계: 업로드
    setStep(1)
    await delay(400)

    // 2단계: 이미지 분석 + 벡터 추출 (실제 처리)
    setStep(2)
    let dxfResult
    try {
      dxfResult = await generateDxfFromImage(file)
    } catch (err) {
      console.error('변환 실패:', err)
      alert('이미지를 변환할 수 없습니다. 다른 이미지 파일로 시도해 주세요.')
      setStep(0)
      setProcessing(false)
      return
    }

    // 3단계: DXF 생성
    setStep(3)
    await delay(400)

    // 완료
    setStep(4)
    const now = new Date().toLocaleString('ko-KR')
    const newResult = { ...dxfResult, convertedAt: now }
    setResult(newResult)

    setHistory(prev => {
      // 이력에는 SVG 미리보기를 제외하고 저장 (localStorage 용량 절약)
      const { svg, ...historyEntry } = newResult
      const newHistory = [historyEntry, ...prev].slice(0, 20)
      try {
        localStorage.setItem('dxf-history', JSON.stringify(newHistory))
      } catch {
        // 저장 실패해도 무시
      }
      return newHistory
    })
    setProcessing(false)
  }

  const downloadDxf = (item) => {
    const blob = new Blob([item.content], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = item.fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setStep(0)
    setResult(null)
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setProcessing(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <header style={{
        borderBottom: '1px solid #30363d',
        background: 'rgba(13,17,23,0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #d4a843, #f0c060)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>📐</div>
            <div>
              <span style={{ color: '#e6edf3', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>
                Image<span style={{ color: '#d4a843' }}>→</span>DXF
              </span>
            </div>
          </div>
          <span style={{ color: '#6e7681', fontSize: 13 }}>
            도면 이미지를 AutoCAD DXF로 변환
          </span>
        </div>
      </header>

      {/* 메인 */}
      <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        {/* 히어로 */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: '#e6edf3', marginBottom: 12, letterSpacing: '-0.5px' }}>
            도면 이미지를 <span style={{ color: '#d4a843' }}>DXF 파일</span>로 변환
          </h1>
          <p style={{ color: '#8b949e', fontSize: 16 }}>
            이미지를 업로드하면 AutoCAD 호환 DXF 파일로 즉시 변환됩니다
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 32 }}>
          {/* 왼쪽: 업로드 + 진행 */}
          <div>
            <div style={{
              background: '#1c2333', borderRadius: 12, padding: 24,
              border: '1px solid #30363d',
            }}>
              <h2 style={{ color: '#e6edf3', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
                이미지 업로드
              </h2>

              {!processing && step === 0 && (
                <UploadZone onFile={handleFile} dragging={dragging} setDragging={setDragging} />
              )}

              {(processing || step > 0) && (
                <>
                  <ProgressBar step={step - 1} />
                  {previewUrl && (
                    <div style={{ marginTop: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid #30363d' }}>
                      <p style={{ color: '#8b949e', fontSize: 12, padding: '8px 12px', background: '#161b22' }}>원본 이미지</p>
                      <img src={previewUrl} alt="원본" style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'contain', background: '#0d1117' }} />
                    </div>
                  )}
                  {processing && (
                    <div style={{ textAlign: 'center', marginTop: 16, color: '#d4a843', fontSize: 14 }}>
                      <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                      {' '}변환 중...
                      <p style={{ color: '#6e7681', fontSize: 12, marginTop: 8 }}>
                        첫 변환 시 문자 인식 모델(약 15MB)을 내려받아 시간이 걸릴 수 있습니다
                      </p>
                    </div>
                  )}
                </>
              )}

              {step === 4 && !processing && (
                <button
                  onClick={reset}
                  style={{
                    marginTop: 16, width: '100%', padding: '10px',
                    background: 'transparent', border: '1px solid #30363d',
                    color: '#8b949e', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  + 새 파일 변환
                </button>
              )}
            </div>
          </div>

          {/* 오른쪽: 변환 결과 */}
          {result && (
            <div>
              <div style={{
                background: '#1c2333', borderRadius: 12, padding: 24,
                border: '1px solid #d4a843',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <span style={{ color: '#3fb950', fontSize: 18 }}>✓</span>
                  <h2 style={{ color: '#e6edf3', fontSize: 16, fontWeight: 600 }}>변환 완료</h2>
                </div>

                {result.svg && (
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #30363d', marginBottom: 16 }}>
                    <p style={{ color: '#8b949e', fontSize: 12, padding: '8px 12px', background: '#161b22' }}>생성된 CAD 도면</p>
                    <div style={{ padding: 8, background: '#0d1117' }} dangerouslySetInnerHTML={{ __html: result.svg }} />
                  </div>
                )}

                <div style={{ background: '#161b22', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#6e7681', fontSize: 13 }}>파일명</span>
                    <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 500 }}>{result.fileName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#6e7681', fontSize: 13 }}>변환 시각</span>
                    <span style={{ color: '#e6edf3', fontSize: 13 }}>{result.convertedAt}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#6e7681', fontSize: 13 }}>추출 결과</span>
                    <span style={{ color: '#e6edf3', fontSize: 13 }}>{result.stats ? `경로 ${result.stats.pathCount} · 정점 ${result.stats.pointCount} · 문자 ${result.stats.textCount ?? 0}` : '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6e7681', fontSize: 13 }}>파일 크기</span>
                    <span style={{ color: '#e6edf3', fontSize: 13 }}>{(result.content.length / 1024).toFixed(1)} KB</span>
                  </div>
                </div>

                <button
                  onClick={() => downloadDxf(result)}
                  style={{
                    width: '100%', padding: '14px',
                    background: 'linear-gradient(135deg, #d4a843, #f0c060)',
                    border: 'none', borderRadius: 8,
                    color: '#0d1117', fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.target.style.opacity = '0.9'}
                  onMouseLeave={e => e.target.style.opacity = '1'}
                >
                  ↓ DXF 파일 다운로드
                </button>

                <div style={{ marginTop: 12, padding: 12, background: 'rgba(212,168,67,0.08)', borderRadius: 8, border: '1px solid rgba(212,168,67,0.2)' }}>
                  <p style={{ color: '#d4a843', fontSize: 12 }}>
                    💡 다운로드된 DXF 파일은 CAD 소프트웨어에서 열어서 확인하세요
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 변환 이력 */}
        {history.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <h2 style={{ color: '#e6edf3', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              변환 이력
            </h2>
            {history.map((item, i) => (
              <HistoryItem key={i} item={item} onDownload={downloadDxf} />
            ))}
          </div>
        )}

        {/* 기능 소개 */}
        {history.length === 0 && step === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 48 }}>
            {[
              { icon: '🔍', title: '문자 인식 + 형상 추적', desc: '글자는 편집 가능한 문자로, 선은 벡터로 자동 변환합니다' },
              { icon: '📐', title: 'DXF R12 표준', desc: 'AutoCAD 등 대부분의 CAD에서 열리는 표준 형식으로 출력됩니다' },
              { icon: '⬇️', title: '즉시 다운로드', desc: '변환된 DXF 파일을 바로 다운로드할 수 있습니다' },
            ].map((f, i) => (
              <div key={i} style={{
                background: '#1c2333', borderRadius: 12, padding: 24,
                border: '1px solid #30363d', textAlign: 'center',
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: '#8b949e', fontSize: 13 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 푸터 */}
      <footer style={{
        borderTop: '1px solid #30363d',
        padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: '#6e7681', fontSize: 13 }}>Image to DXF Converter</span>
        <span style={{ color: '#d4a843', fontSize: 13, fontWeight: 500 }}>made by KSN</span>
      </footer>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
