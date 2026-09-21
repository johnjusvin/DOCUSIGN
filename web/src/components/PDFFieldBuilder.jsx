import React, { useState, useRef, useEffect } from 'react'
import { PdfCanvas, overlayClickToPdfPoint, fieldToPercentStyle } from './PdfCanvas'
import './PDFFieldBuilder.css'

const FIELD_TYPES = [
  { id: 'signature', label: 'Signature' },
  { id: 'initials', label: 'Initials' },
  { id: 'name', label: 'Full Name' },
  { id: 'email', label: 'Email' },
  { id: 'date', label: 'Date' },
  { id: 'text', label: 'Text Field' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'radio', label: 'Radio Button' },
  { id: 'choice', label: 'Choice' },
]

const DEFAULT_SIZE = {
  signature: [150, 50], initials: [100, 40], name: [180, 36], email: [200, 36],
  date: [120, 36], text: [200, 60], checkbox: [24, 24], radio: [24, 24], choice: [180, 36],
}

export function PDFFieldBuilder({ document, pdfUrl, pdfPages, fields, signers, onFieldsChange }) {
  const [selectedFieldType, setSelectedFieldType] = useState('signature')
  const [selectedSignerIndex, setSelectedSignerIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedFieldId, setSelectedFieldId] = useState(null)
  const [scale, setScale] = useState(1.25)
  const [showGrid, setShowGrid] = useState(false)
  const dragRef = useRef(null)

  const totalPages = (pdfPages && pdfPages.length) || document?.page_count || 1
  const pageSize = (pdfPages && pdfPages[currentPage]) || { width: 612, height: 792 }

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFieldId && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
        onFieldsChange(fields.filter((f) => f.id !== selectedFieldId))
        setSelectedFieldId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedFieldId, fields, onFieldsChange])

  const placeField = (e) => {
    if (e.target !== e.currentTarget) return
    const { x, y } = overlayClickToPdfPoint(e, pageSize.width, pageSize.height)
    const [w, h] = DEFAULT_SIZE[selectedFieldType] || [150, 50]
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      page: currentPage,
      x: Math.max(0, Math.min(x - w / 2, pageSize.width - w)),
      y: Math.max(0, Math.min(y - h / 2, pageSize.height - h)),
      width: Math.min(w, pageSize.width),
      height: Math.min(h, pageSize.height),
      type: selectedFieldType,
      signer_index: Math.min(selectedSignerIndex, Math.max(0, signers.length - 1)),
      required: true,
      label: '',
      value: '',
    }
    onFieldsChange([...fields, newField])
    setSelectedFieldId(newField.id)
  }

  const beginDrag = (e, field, mode) => {
    e.stopPropagation()
    setSelectedFieldId(field.id)
    const layer = e.currentTarget.parentElement
    const rect = layer.getBoundingClientRect()
    dragRef.current = {
      id: field.id, mode,
      startClientX: e.clientX, startClientY: e.clientY,
      orig: { ...field },
      pxPerPtX: rect.width / pageSize.width,
      pxPerPtY: rect.height / pageSize.height,
    }
    const onMove = (mv) => {
      const d = dragRef.current
      if (!d) return
      const dxPt = (mv.clientX - d.startClientX) / d.pxPerPtX
      const dyPt = (mv.clientY - d.startClientY) / d.pxPerPtY
      const o = d.orig
      let next = { ...o }
      if (d.mode === 'move') {
        next.x = Math.max(0, Math.min(o.x + dxPt, pageSize.width - o.width))
        next.y = Math.max(0, Math.min(o.y + dyPt, pageSize.height - o.height))
      } else {
        next.width = Math.max(20, Math.min(o.width + dxPt, pageSize.width - o.x))
        next.height = Math.max(20, Math.min(o.height + dyPt, pageSize.height - o.y))
      }
      onFieldsChange(fields.map((f) => (f.id === d.id ? next : f)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const pageFields = fields.filter((f) => f.page === currentPage)
  const selectedField = fields.find((f) => f.id === selectedFieldId)

  return (
    <div className="field-builder">
      <div className="builder-toolbar">
        <div className="toolbar-group">
          <label>Field Type:</label>
          <div className="field-type-picker">
            {FIELD_TYPES.map((type) => (
              <button
                key={type.id}
                className={`field-type-btn ${selectedFieldType === type.id ? 'active' : ''}`}
                onClick={() => setSelectedFieldType(type.id)}
                title={type.label}
              >
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-group">
          <label>Assign to:</label>
          <select
            value={selectedSignerIndex}
            onChange={(e) => setSelectedSignerIndex(Number(e.target.value))}
            className="signer-select"
          >
            {signers.map((s, i) => (
              <option key={i} value={i}>{s.name || `Signer ${i + 1}`}{s.email ? ` (${s.email})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-group">
          <label>Page:</label>
          <div className="page-nav">
            <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>‹</button>
            <span className="page-indicator">{currentPage + 1} / {totalPages}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}>›</button>
          </div>
        </div>

        <div className="toolbar-group">
          <label>Zoom:</label>
          <div className="zoom-control">
            <button onClick={() => setScale((s) => Math.max(0.6, s - 0.25))}>−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}>+</button>
          </div>
        </div>

        <div className="toolbar-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            <span>Grid</span>
          </label>
        </div>
      </div>

      <div className="builder-main">
        <div className="canvas-container">
          <PdfCanvas url={pdfUrl} page={currentPage} scale={scale}>
            <div
              className={`builder-click-layer ${showGrid ? 'with-grid' : ''}`}
              onClick={placeField}
            >
              {pageFields.map((field) => (
                <div
                  key={field.id}
                  className={`builder-field ${field.id === selectedFieldId ? 'selected' : ''}`}
                  style={fieldToPercentStyle(field, pageSize.width, pageSize.height)}
                  onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id) }}
                  onMouseDown={(e) => beginDrag(e, field, 'move')}
                >
                  <span className="builder-field-tag">
                    {field.type} → {signers[field.signer_index]?.name || `Signer ${(field.signer_index || 0) + 1}`}
                    {field.required ? ' *' : ''}
                  </span>
                  <span
                    className="builder-resize"
                    onMouseDown={(e) => beginDrag(e, field, 'resize')}
                    title="Drag to resize"
                  />
                </div>
              ))}
            </div>
          </PdfCanvas>
          <p className="builder-hint">Click anywhere on the page to place a {selectedFieldType} field • drag fields to move • drag the corner dot to resize • Del removes the selected field</p>
        </div>

        <div className="builder-sidebar">
          <div className="sidebar-section">
            <h4>Fields on Page {currentPage + 1} ({pageFields.length})</h4>
            {pageFields.length === 0 ? (
              <p className="empty-hint">Click on the document to place a field</p>
            ) : (
              <ul className="field-list">
                {pageFields.map((field) => (
                  <li
                    key={field.id}
                    className={`field-item ${field.id === selectedFieldId ? 'selected' : ''}`}
                    onClick={() => setSelectedFieldId(field.id)}
                  >
                    <div className="field-item-info">
                      <span className="field-item-type">{field.type}</span>
                      <span className="field-item-signer">{signers[field.signer_index]?.name || `Signer ${(field.signer_index || 0) + 1}`}</span>
                    </div>
                    <div className="field-item-props">
                      {field.required && <span className="badge required">Required</span>}
                      <span className="badge position">({Math.round(field.x)}, {Math.round(field.y)})</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedField && (
            <div className="sidebar-section">
              <h4>Field Properties</h4>
              <FieldProperties
                field={selectedField}
                signers={signers}
                onUpdate={(updates) => onFieldsChange(fields.map((f) => (f.id === selectedFieldId ? { ...f, ...updates } : f)))}
                onDelete={() => {
                  onFieldsChange(fields.filter((f) => f.id !== selectedFieldId))
                  setSelectedFieldId(null)
                }}
              />
            </div>
          )}

          <div className="sidebar-section">
            <h4>All Fields ({fields.length})</h4>
            {fields.length === 0 ? (
              <p className="empty-hint">No fields placed yet</p>
            ) : (
              <ul className="field-list compact">
                {fields.map((field) => (
                  <li
                    key={field.id}
                    className={`field-item ${field.id === selectedFieldId ? 'selected' : ''}`}
                    onClick={() => { setCurrentPage(field.page); setSelectedFieldId(field.id) }}
                  >
                    <div className="field-item-info">
                      <span className="field-item-type">{field.type}</span>
                      <span className="field-item-page">Page {field.page + 1}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldProperties({ field, signers, onUpdate, onDelete }) {
  if (!field) return null
  return (
    <div className="field-properties">
      <div className="prop-row">
        <label>Type</label>
        <select value={field.type} onChange={(e) => onUpdate({ type: e.target.value })}>
          {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="prop-row">
        <label>Assigned To</label>
        <select value={field.signer_index} onChange={(e) => onUpdate({ signer_index: Number(e.target.value) })}>
          {signers.map((s, i) => (
            <option key={i} value={i}>{s.name || `Signer ${i + 1}`}</option>
          ))}
        </select>
      </div>
      <div className="prop-row">
        <label>Required</label>
        <label className="toggle">
          <input type="checkbox" checked={!!field.required} onChange={(e) => onUpdate({ required: e.target.checked })} />
          <span className="toggle-slider"></span>
        </label>
      </div>
      <div className="prop-row">
        <label>Label</label>
        <input type="text" value={field.label || ''} onChange={(e) => onUpdate({ label: e.target.value })} placeholder="Optional label" />
      </div>
      <div className="prop-row">
        <label>Position (pt)</label>
        <div className="position-inputs">
          <input type="number" value={Math.round(field.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })} placeholder="X" />
          <input type="number" value={Math.round(field.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })} placeholder="Y" />
        </div>
      </div>
      <div className="prop-row">
        <label>Size (pt)</label>
        <div className="position-inputs">
          <input type="number" value={Math.round(field.width)} onChange={(e) => onUpdate({ width: Math.max(10, Number(e.target.value) || 10) })} placeholder="W" />
          <input type="number" value={Math.round(field.height)} onChange={(e) => onUpdate({ height: Math.max(10, Number(e.target.value) || 10) })} placeholder="H" />
        </div>
      </div>
      <button className="btn-danger-ghost" onClick={onDelete}>Delete field</button>
    </div>
  )
}
