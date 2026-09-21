import React, { useRef, useState, useEffect } from 'react'
import './SignaturePad.css'

export function SignaturePad({ onComplete, onCancel, type = 'signature' }) {
  const canvasRef = useRef(null)
  const [mode, setMode] = useState('draw') // draw, type, upload
  const [typedName, setTypedName] = useState('')
  const [selectedFont, setSelectedFont] = useState('cursive')
  const [uploadedImage, setUploadedImage] = useState(null)
  const [drawing, setDrawing] = useState(false)
  const [color, setColor] = useState('#0a1628')

  const fonts = [
    { id: 'cursive', name: 'Cursive', font: '"Brush Script MT", cursive' },
    { id: 'script', name: 'Script', font: '"Lucida Handwriting", cursive' },
    { id: 'serif', name: 'Serif', font: 'Georgia, serif' },
    { id: 'sans', name: 'Sans', font: 'Arial, sans-serif' },
  ]

  const canvas = canvasRef.current
  const ctx = canvas?.getContext('2d')

  useEffect(() => {
    if (canvas) {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
  }, [])

  const clearCanvas = () => {
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  const handleMouseDown = (e) => {
    if (!canvas || !ctx) return
    setDrawing(true)
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }

  const handleMouseMove = (e) => {
    if (!drawing || !canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
  }

  const handleMouseUp = () => {
    setDrawing(false)
  }

  const getCanvasData = () => {
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  }

  const handleTypeSubmit = () => {
    if (!typedName.trim()) return
    // Create canvas with typed name
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')
    tempCanvas.width = 600
    tempCanvas.height = 200
    tempCtx.fillStyle = 'white'
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
    tempCtx.font = `italic 48px ${fonts.find(f => f.id === selectedFont)?.font || 'cursive'}`
    tempCtx.fillStyle = color
    tempCtx.textAlign = 'center'
    tempCtx.textBaseline = 'middle'
    tempCtx.fillText(typedName, tempCanvas.width / 2, tempCanvas.height / 2)
    onComplete(tempCanvas.toDataURL('image/png'))
  }

  const handleUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.match('image/(png|jpeg)')) {
      alert('Please upload PNG or JPEG image')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setUploadedImage(event.target.result)
      // Verify it's a valid image
      const img = new Image()
      img.onload = () => {
        const tempCanvas = document.createElement('canvas')
        const tempCtx = tempCanvas.getContext('2d')
        tempCanvas.width = 600
        tempCanvas.height = 200
        tempCtx.fillStyle = 'white'
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
        // Scale image to fit
        const scale = Math.min(580 / img.width, 180 / img.height)
        const w = img.width * scale
        const h = img.height * scale
        tempCtx.drawImage(img, (tempCanvas.width - w) / 2, (tempCanvas.height - h) / 2, w, h)
        onComplete(tempCanvas.toDataURL('image/png'))
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleAdopt = () => {
    if (mode === 'draw') {
      const data = getCanvasData()
      if (data) onComplete(data)
    } else if (mode === 'type') {
      handleTypeSubmit()
    } else if (mode === 'upload' && uploadedImage) {
      // Already handled in handleUpload
    }
  }

  return (
    <div className="signature-modal">
      <div className="signature-header">
        <h3>Create Your {type === 'initials' ? 'Initials' : 'Signature'}</h3>
        <button className="close-btn" onClick={onCancel}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="signature-tabs">
        <button className={`sig-tab ${mode === 'draw' ? 'active' : ''}`} onClick={() => setMode('draw')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
          Draw
        </button>
        <button className={`sig-tab ${mode === 'type' ? 'active' : ''}`} onClick={() => setMode('type')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
          Type
        </button>
        <button className={`sig-tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Upload
        </button>
      </div>

      <div className="signature-content">
        {mode === 'draw' && (
          <div className="draw-mode">
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={(e) => handleMouseDown(e.touches[0])}
              onTouchMove={(e) => { e.preventDefault(); handleMouseMove(e.touches[0]) }}
              onTouchEnd={handleMouseUp}
            />
            <div className="draw-controls">
              <div className="color-picker">
                <label>Color:</label>
                <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (ctx) ctx.strokeStyle = e.target.value }} />
              </div>
              <button className="btn-secondary" onClick={clearCanvas}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                Clear
              </button>
            </div>
          </div>
        )}

        {mode === 'type' && (
          <div className="type-mode">
            <div className="type-preview" style={{ fontFamily: fonts.find(f => f.id === selectedFont)?.font || 'cursive', color }}>
              {typedName || 'Your Name'}
            </div>
            <div className="type-controls">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Enter your full name"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Font Style</label>
                <select value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)}>
                  {fonts.map(f => (
                    <option key={f.id} value={f.id} style={{ fontFamily: f.font }}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Color</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {mode === 'upload' && (
          <div className="upload-mode">
            <div className="upload-zone" onClick={() => fileInput.click()}>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" onChange={handleUpload} hidden />
              {uploadedImage ? (
                <img src={uploadedImage} alt="Uploaded signature" style={{ maxWidth: '100%', maxHeight: '200px' }} />
              ) : (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <p>Click to upload signature image</p>
                  <span>PNG or JPEG • Max 5MB</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="signature-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={handleAdopt}>
          {mode === 'draw' ? 'Adopt Signature' : mode === 'type' ? 'Adopt Signature' : 'Use Image'}
        </button>
      </div>
    </div>
  )
}

const fileInput = React.createRef()