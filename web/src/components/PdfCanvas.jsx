import React, { useRef, useEffect, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfCanvas.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker

// Cache loaded documents by URL so page switches don't re-fetch
const docCache = new Map()

async function loadDocument(url) {
  if (!docCache.has(url)) {
    const task = pdfjsLib.getDocument({ url, withCredentials: true }).promise
    docCache.set(url, task)
    try {
      await task
    } catch (e) {
      docCache.delete(url)
      throw e
    }
  }
  return docCache.get(url)
}

export function PdfCanvas({ url, page = 0, scale = 1.25, onLoad, children, className = '' }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState('')
  const [numPages, setNumPages] = useState(0)
  const [renderKey, setRenderKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError('')
    if (!url) return

    loadDocument(url).then(async (pdf) => {
      if (cancelled) return
      setNumPages(pdf.numPages)
      if (onLoad) onLoad({ numPages: pdf.numPages })
      const pdfPage = await pdf.getPage(Math.min(page + 1, pdf.numPages))
      if (cancelled) return
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      await pdfPage.render({ canvasContext: ctx, viewport }).promise
      if (!cancelled) setRenderKey((k) => k + 1)
    }).catch((e) => {
      if (!cancelled) {
        console.error('PDF render failed', e)
        setError(e && e.message ? e.message : 'Could not render PDF')
      }
    })

    return () => { cancelled = true }
  }, [url, page, scale])

  // pdfPoint -> percent helpers are applied by parents; expose dims via data attrs
  return (
    <div className={`pdf-canvas-wrap ${className}`} data-render={renderKey}>
      {error ? (
        <div className="pdf-error">
          <p>Could not render this PDF page.</p>
          <span>{error}</span>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="pdf-canvas-el" />
          <div className="pdf-overlay-layer">{children}</div>
        </>
      )}
    </div>
  )
}

// Convert a click on the overlay layer to PDF-point coordinates (top-left origin)
export function overlayClickToPdfPoint(e, pdfWidth, pdfHeight) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * pdfWidth
  const y = ((e.clientY - rect.top) / rect.height) * pdfHeight
  return { x, y }
}

// Field rect (pdf points) -> CSS percent style for overlay positioning
export function fieldToPercentStyle(field, pdfWidth, pdfHeight) {
  if (!pdfWidth || !pdfHeight) return { display: 'none' }
  return {
    left: `${(field.x / pdfWidth) * 100}%`,
    top: `${(field.y / pdfHeight) * 100}%`,
    width: `${(field.width / pdfWidth) * 100}%`,
    height: `${(field.height / pdfHeight) * 100}%`,
  }
}
