/**
 * SvgAnnotator — 2D annotation overlay for SVG plan documents
 *
 * Full-viewport overlay that replaces the 3D view when active.
 * Provides interactive pan/zoom, element selection, and semantic
 * metadata tagging for SVG elements.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import useStore from '../store'
import { autoDetectElements } from '../utils/svgImporter'

const TOOLS = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'pan', label: 'Pan', key: 'H' },
  { id: 'origin', label: 'Origin', key: 'O' },
  { id: 'scale', label: 'Scale', key: 'S' },
]

const SELECTABLE_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'path', 'text', 'image', 'use', 'g',
])

let _groupIdCounter = 0
function generateGroupId() {
  return `svg-grp-${_groupIdCounter++}-${Date.now().toString(36)}`
}

export default function SvgAnnotator() {
  const annotationMode = useStore(s => s.annotationMode)
  const scene = useStore(s => s.scene)
  const exitAnnotationMode = useStore(s => s.exitAnnotationMode)
  const updateSvgAnnotation = useStore(s => s.updateSvgAnnotation)
  const removeSvgAnnotation = useStore(s => s.removeSvgAnnotation)
  const addSvgElementGroup = useStore(s => s.addSvgElementGroup)
  const removeSvgElementGroup = useStore(s => s.removeSvgElementGroup)
  const updateSvgPlanCalibration = useStore(s => s.updateSvgPlanCalibration)
  const updateObject = useStore(s => s.updateObject)

  const planObj = scene.objects.find(o => o.id === annotationMode.planId)

  const [tool, setTool] = useState('select')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [selectedElements, setSelectedElements] = useState(new Set())
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 })
  const [scaleElement, setScaleElement] = useState(null)
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleValue, setScaleValue] = useState('')
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#00d4aa')

  const canvasRef = useRef(null)
  const svgContainerRef = useRef(null)

  const planId = annotationMode.planId

  // Keyboard shortcuts for annotation mode
  useEffect(() => {
    if (!annotationMode.active) return
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') {
        exitAnnotationMode()
        return
      }
      if (e.key === 'v' || e.key === 'V') setTool('select')
      if (e.key === 'h' || e.key === 'H') setTool('pan')
      if (e.key === 'o' || e.key === 'O') setTool('origin')
      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) setTool('scale')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [annotationMode.active, exitAnnotationMode])

  // SVG element click handler
  const handleSvgClick = useCallback((e) => {
    if (!planObj) return

    // Get the clicked SVG element
    let target = e.target
    // Walk up to find a selectable element within the SVG
    while (target && target !== svgContainerRef.current) {
      if (target.id && SELECTABLE_TAGS.has(target.tagName?.toLowerCase())) break
      target = target.parentElement
    }
    if (!target || target === svgContainerRef.current) {
      if (tool === 'select') setSelectedElements(new Set())
      return
    }

    if (tool === 'origin') {
      // Set origin at click position
      const svgEl = svgContainerRef.current?.querySelector('svg')
      if (!svgEl) return
      const rect = svgEl.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom
      updateSvgPlanCalibration(planId, { svgOrigin: { x, y } })
      setTool('select')
      return
    }

    if (tool === 'scale') {
      setScaleElement(target.id)
      setShowScaleModal(true)
      return
    }

    if (tool === 'select') {
      const elementId = target.id
      if (!elementId) return

      if (e.shiftKey) {
        setSelectedElements(prev => {
          const next = new Set(prev)
          if (next.has(elementId)) next.delete(elementId)
          else next.add(elementId)
          return next
        })
      } else {
        setSelectedElements(new Set([elementId]))
      }
    }
  }, [tool, planObj, planId, zoom, updateSvgPlanCalibration])

  // Pan handlers
  const handleMouseDown = useCallback((e) => {
    if (tool === 'pan' || e.button === 1) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [tool, pan])

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
    }
    // Update coordinate display
    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect()
      const svgX = (e.clientX - rect.left) / zoom
      const svgY = (e.clientY - rect.top) / zoom
      if (planObj?.svgOrigin && planObj?.svgScale) {
        setMouseCoords({
          x: ((svgX - planObj.svgOrigin.x) / planObj.svgScale).toFixed(2),
          y: ((svgY - planObj.svgOrigin.y) / planObj.svgScale).toFixed(2),
        })
      } else {
        setMouseCoords({ x: Math.round(svgX), y: Math.round(svgY) })
      }
    }
  }, [isPanning, panStart, zoom, planObj])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Zoom with scroll wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(0.1, Math.min(10, prev * delta)))
  }, [])

  // Scale modal confirm
  const handleSetScale = useCallback(() => {
    if (!scaleElement || !planObj) return
    const val = parseFloat(scaleValue)
    if (!val || val <= 0) return

    // Find the element and measure it in SVG pixel space
    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return
    const el = svgEl.querySelector(`#${CSS.escape(scaleElement)}`)
    if (!el) return

    const bbox = el.getBBox()
    const longestDim = Math.max(bbox.width, bbox.height)
    if (longestDim === 0) return

    // svgScale = pixels per scene unit
    const pxPerUnit = longestDim / val
    updateSvgPlanCalibration(planId, { svgScale: pxPerUnit })
    setShowScaleModal(false)
    setScaleValue('')
    setScaleElement(null)
    setTool('select')
  }, [scaleElement, scaleValue, planObj, planId, updateSvgPlanCalibration])

  // Auto-detect element types
  const handleAutoDetect = useCallback(() => {
    if (!planObj?.svgContent) return
    const suggestions = autoDetectElements(planObj.svgContent)
    Object.entries(suggestions).forEach(([elId, meta]) => {
      updateSvgAnnotation(planId, elId, meta)
    })
  }, [planObj, planId, updateSvgAnnotation])

  // Create group from selection
  const handleCreateGroup = useCallback(() => {
    if (selectedElements.size === 0) return
    setShowGroupModal(true)
  }, [selectedElements])

  const handleConfirmGroup = useCallback(() => {
    if (!newGroupName.trim()) return
    const group = {
      id: generateGroupId(),
      name: newGroupName.trim(),
      color: newGroupColor,
      elementIds: Array.from(selectedElements),
    }
    addSvgElementGroup(planId, group)
    // Tag each selected element with the group
    selectedElements.forEach(elId => {
      updateSvgAnnotation(planId, elId, { dataGroup: group.id })
    })
    setShowGroupModal(false)
    setNewGroupName('')
    setNewGroupColor('#00d4aa')
  }, [newGroupName, newGroupColor, selectedElements, planId, addSvgElementGroup, updateSvgAnnotation])

  // Apply selection highlighting to SVG elements
  useEffect(() => {
    const svgEl = svgContainerRef.current?.querySelector('svg')
    if (!svgEl) return

    // Clear previous highlights
    svgEl.querySelectorAll('[data-annotator-highlight]').forEach(el => {
      el.style.outline = ''
      el.removeAttribute('data-annotator-highlight')
    })

    // Apply new highlights
    selectedElements.forEach(id => {
      const el = svgEl.querySelector(`#${CSS.escape(id)}`)
      if (el) {
        el.style.outline = '2px solid #00d4aa'
        el.setAttribute('data-annotator-highlight', 'true')
      }
    })

    // Highlight group elements with their color
    if (planObj?.elementGroups) {
      planObj.elementGroups.forEach(group => {
        group.elementIds.forEach(id => {
          if (selectedElements.has(id)) return // selection highlight takes priority
          const el = svgEl.querySelector(`#${CSS.escape(id)}`)
          if (el) {
            el.style.outline = `1px dashed ${group.color}`
            el.setAttribute('data-annotator-highlight', 'group')
          }
        })
      })
    }
  }, [selectedElements, planObj?.elementGroups])

  if (!annotationMode.active || !planObj) return null

  const annotations = planObj.annotations || {}
  const groups = planObj.elementGroups || []
  const firstSelected = selectedElements.size === 1 ? Array.from(selectedElements)[0] : null
  const firstAnnotation = firstSelected ? annotations[firstSelected] || {} : null

  return (
    <div className="svg-annotator-overlay">
      {/* Header bar */}
      <div className="svg-annotator-header">
        <span className="svg-annotator-title">SVG Annotator: {planObj.name}</span>
        <span className="svg-annotator-coords">
          {mouseCoords.x}, {mouseCoords.y} {planObj.svgScale ? planObj.svgScale.toFixed(1) + ' px/unit' : 'px'}
        </span>
        <div className="svg-annotator-header-actions">
          <button onClick={handleAutoDetect}>Auto-Detect</button>
          <button onClick={exitAnnotationMode}>Back to 3D</button>
        </div>
      </div>

      <div className="svg-annotator-body">
        {/* Left panel — tools + groups */}
        <div className="svg-annotator-left">
          <div className="svg-annotator-tools">
            <div className="inspector-section-title">Tools</div>
            {TOOLS.map(t => (
              <button
                key={t.id}
                className={tool === t.id ? 'active' : ''}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.key})`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="svg-annotator-groups">
            <div className="inspector-section-title">Groups</div>
            {groups.map(g => (
              <div key={g.id} className="svg-group-item">
                <span
                  className="svg-group-color"
                  style={{ background: g.color }}
                />
                <span
                  className="svg-group-name"
                  onClick={() => {
                    setSelectedElements(new Set(g.elementIds))
                  }}
                >
                  {g.name}
                </span>
                <span className="svg-group-count">{g.elementIds.length}</span>
                <button
                  className="tag-remove"
                  onClick={() => removeSvgElementGroup(planId, g.id)}
                >
                  x
                </button>
              </div>
            ))}
            {selectedElements.size > 0 && (
              <button onClick={handleCreateGroup} style={{ width: '100%', marginTop: 4 }}>
                Group ({selectedElements.size})
              </button>
            )}
          </div>

          <div className="svg-annotator-stats">
            <div className="inspector-section-title">Info</div>
            <div style={{ fontSize: 11, color: '#808090' }}>
              {planObj.svgFileName || 'Unknown file'}
            </div>
            <div style={{ fontSize: 11, color: '#808090' }}>
              {planObj.svgDimensions?.[0]} x {planObj.svgDimensions?.[1]} px
            </div>
            <div style={{ fontSize: 11, color: '#808090' }}>
              {Object.keys(annotations).length} annotated
            </div>
            <div style={{ fontSize: 11, color: '#808090' }}>
              Origin: {planObj.svgOrigin ? `${Math.round(planObj.svgOrigin.x)}, ${Math.round(planObj.svgOrigin.y)}` : 'Not set'}
            </div>
            <div style={{ fontSize: 11, color: '#808090' }}>
              Scale: {planObj.svgScale ? `${planObj.svgScale.toFixed(1)} px/unit` : 'Not calibrated'}
            </div>
          </div>
        </div>

        {/* Center — SVG canvas */}
        <div
          className="svg-annotator-canvas"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleSvgClick}
          style={{ cursor: tool === 'pan' || isPanning ? 'grab' : 'crosshair' }}
        >
          <div
            ref={svgContainerRef}
            className="svg-annotator-svg-container"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
            dangerouslySetInnerHTML={{ __html: planObj.svgContent }}
          />
          {/* Zoom controls */}
          <div className="svg-annotator-zoom">
            <button onClick={() => setZoom(z => Math.min(10, z * 1.2))}>+</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(0.1, z / 1.2))}>-</button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Fit</button>
          </div>
        </div>

        {/* Right panel — properties */}
        <div className="svg-annotator-right">
          <div className="inspector-section-title">Properties</div>
          {firstSelected ? (
            <div className="svg-annotator-props">
              <div className="inspector-field">
                <label>ID</label>
                <span style={{ fontSize: 11, color: '#a0a0b0' }}>{firstSelected}</span>
              </div>
              <div className="inspector-field">
                <label>data-type</label>
                <input
                  value={firstAnnotation?.dataType || ''}
                  onChange={e => updateSvgAnnotation(planId, firstSelected, { dataType: e.target.value })}
                  placeholder="zone, actuator, sensor..."
                />
              </div>
              <div className="inspector-field">
                <label>data-zone</label>
                <input
                  value={firstAnnotation?.dataZone || ''}
                  onChange={e => updateSvgAnnotation(planId, firstSelected, { dataZone: e.target.value })}
                  placeholder="zone name"
                />
              </div>
              <div className="inspector-field">
                <label>data-layer</label>
                <input
                  value={firstAnnotation?.dataLayer || ''}
                  onChange={e => updateSvgAnnotation(planId, firstSelected, { dataLayer: e.target.value })}
                  placeholder="tracking, control..."
                />
              </div>
              <div className="inspector-field">
                <label>Tags</label>
                <input
                  value={(firstAnnotation?.dataTags || []).join(', ')}
                  onChange={e => {
                    const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                    updateSvgAnnotation(planId, firstSelected, { dataTags: tags })
                  }}
                  placeholder="tag1, tag2..."
                />
              </div>
              <div className="inspector-field">
                <label>Group</label>
                <select
                  value={firstAnnotation?.dataGroup || ''}
                  onChange={e => updateSvgAnnotation(planId, firstSelected, { dataGroup: e.target.value })}
                >
                  <option value="">-- none --</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              {firstAnnotation && Object.keys(firstAnnotation).length > 0 && (
                <button
                  onClick={() => removeSvgAnnotation(planId, firstSelected)}
                  style={{ marginTop: 8, background: '#401818', borderColor: '#602828', width: '100%' }}
                >
                  Clear Annotation
                </button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#505070', padding: '8px 0' }}>
              {selectedElements.size > 1
                ? `${selectedElements.size} elements selected`
                : 'Click an element to inspect'}
            </div>
          )}

          {/* Multi-select bulk actions */}
          {selectedElements.size > 1 && (
            <div className="svg-annotator-bulk">
              <div className="inspector-section-title" style={{ marginTop: 12 }}>Bulk Assign</div>
              <BulkEditor
                planId={planId}
                selectedElements={selectedElements}
                groups={groups}
                updateSvgAnnotation={updateSvgAnnotation}
              />
            </div>
          )}
        </div>
      </div>

      {/* Scale modal */}
      {showScaleModal && (
        <div className="modal-overlay" onClick={() => setShowScaleModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <div className="modal-header">
              <h3>Set Scale Reference</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: '#a0a0b0', marginBottom: 12 }}>
                Element: <strong>{scaleElement}</strong><br />
                Enter the real-world dimension (in scene units) that this element represents.
              </p>
              <div className="inspector-field">
                <label>Value</label>
                <input
                  type="number"
                  value={scaleValue}
                  onChange={e => setScaleValue(e.target.value)}
                  placeholder="e.g. 100"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSetScale()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowScaleModal(false)}>Cancel</button>
              <button onClick={handleSetScale} style={{ background: '#2060a0' }}>Set Scale</button>
            </div>
          </div>
        </div>
      )}

      {/* Group creation modal */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <div className="modal-header">
              <h3>Create Group</h3>
            </div>
            <div className="modal-body">
              <div className="inspector-field">
                <label>Name</label>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleConfirmGroup()}
                />
              </div>
              <div className="inspector-field">
                <label>Color</label>
                <input
                  type="color"
                  value={newGroupColor}
                  onChange={e => setNewGroupColor(e.target.value)}
                  style={{ width: 40, padding: 2 }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#808090', marginTop: 8 }}>
                {selectedElements.size} elements will be added to this group.
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button onClick={handleConfirmGroup} style={{ background: '#2060a0' }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Bulk editor for multi-selection
 */
function BulkEditor({ planId, selectedElements, groups, updateSvgAnnotation }) {
  const [dataType, setDataType] = useState('')
  const [dataLayer, setDataLayer] = useState('')

  function applyBulk() {
    selectedElements.forEach(elId => {
      const updates = {}
      if (dataType) updates.dataType = dataType
      if (dataLayer) updates.dataLayer = dataLayer
      updateSvgAnnotation(planId, elId, updates)
    })
  }

  return (
    <>
      <div className="inspector-field">
        <label>data-type</label>
        <input
          value={dataType}
          onChange={e => setDataType(e.target.value)}
          placeholder="type for all"
        />
      </div>
      <div className="inspector-field">
        <label>data-layer</label>
        <input
          value={dataLayer}
          onChange={e => setDataLayer(e.target.value)}
          placeholder="layer for all"
        />
      </div>
      <button onClick={applyBulk} style={{ width: '100%', marginTop: 4 }}>
        Apply to {selectedElements.size}
      </button>
    </>
  )
}
