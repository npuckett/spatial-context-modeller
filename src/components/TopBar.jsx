/**
 * TopBar — Scene name, units, and file actions
 */

import React, { useState } from 'react'
import useStore from '../store'
import { exportSceneContext } from '../utils/contextExport'
import { exportAnnotatedSvg } from '../utils/svgExporter'
import { convertWorldCoordinates, DROP_CEILING_WORLD_COORDINATES } from '../utils/dropCeilingConverter'
import { parseOBJ } from '../utils/objParser'
import { parseSvgForImport } from '../utils/svgImporter'
import ContextModal from './ContextModal'

export default function TopBar() {
  const scene = useStore(s => s.scene)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const loadScene = useStore(s => s.loadScene)
  const addObject = useStore(s => s.addObject)
  const enterAnnotationMode = useStore(s => s.enterAnnotationMode)
  const historyIndex = useStore(s => s.historyIndex)
  const historyLength = useStore(s => s.history.length)
  const [showContext, setShowContext] = useState(false)

  function handleSave() {
    const json = JSON.stringify(scene, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scene.name.replace(/\s+/g, '_').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoad() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result)
          if (data.objects && data.name) {
            loadScene(data)
          } else {
            alert('Invalid scene file. Expected { name, objects, references, ... }')
          }
        } catch (err) {
          alert('Failed to parse JSON: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function handleLoadDemo() {
    const demoScene = convertWorldCoordinates(DROP_CEILING_WORLD_COORDINATES)
    loadScene(demoScene)
  }

  function handleImportOBJ() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.obj'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const parsed = parseOBJ(ev.target.result)
          addObject('mesh', {
            name: file.name.replace(/\.obj$/i, ''),
            position: parsed.centroid,
            scale: [1, 1, 1],
            geometry: {
              vertices: Array.from(parsed.vertices),
              indices: parsed.indices,
              vertexCount: parsed.vertexCount,
              faceCount: parsed.faceCount,
              size: parsed.size,
            },
            tags: {
              role: 'structural',
              source_file: file.name,
            },
          })
        } catch (err) {
          alert('Failed to parse OBJ: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function handleImportSVG() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const result = parseSvgForImport(ev.target.result)
          const planId = addObject('svgPlan', {
            name: file.name.replace(/\.svg$/i, ''),
            svgContent: result.cleanedSvg,
            svgFileName: file.name,
            svgDimensions: result.dimensions,
            tags: {
              role: 'reference',
              source_file: file.name,
              element_count: String(result.elementCount),
            },
          })
        } catch (err) {
          alert('Failed to parse SVG: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const hasSvgPlans = scene.objects.some(o => o.type === 'svgPlan')

  function handleExportSVG() {
    const svgPlans = scene.objects.filter(o => o.type === 'svgPlan')
    for (const plan of svgPlans) {
      const annotatedSvg = exportAnnotatedSvg(plan)
      const blob = new Blob([annotatedSvg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(plan.name || 'plan').replace(/\s+/g, '_').toLowerCase()}-annotated.svg`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <>
      <div className="top-bar">
        <span className="scene-name">{scene.name}</span>
        <span className="scene-units">{scene.units}</span>
        <div className="top-bar-actions">
          <button onClick={undo} disabled={historyIndex <= 0} title="Undo (⌘Z)">↩</button>
          <button onClick={redo} disabled={historyIndex >= historyLength - 1} title="Redo (⌘⇧Z)">↪</button>
          <button onClick={handleLoad}>Open</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={handleImportOBJ}>Import OBJ</button>
          <button onClick={handleImportSVG}>Import SVG</button>
          <button onClick={handleLoadDemo}>Load Demo</button>
          <button onClick={() => setShowContext(true)}>Export Context</button>
          {hasSvgPlans && (
            <button onClick={handleExportSVG}>Export SVG</button>
          )}
        </div>
      </div>
      {showContext && (
        <ContextModal
          text={exportSceneContext(scene)}
          onClose={() => setShowContext(false)}
        />
      )}
    </>
  )
}
