/**
 * SvgPlanObject — Renders an SVG plan as a textured plane in 3D
 *
 * Renders the SVG to an offscreen canvas, creates a CanvasTexture,
 * and maps it onto an oriented PlaneGeometry.
 *
 * Orientation mapping:
 *   plan           → lies on XZ ground plane (rotation -90° around X)
 *   elevation-front → vertical, facing camera (no extra rotation)
 *   elevation-side  → vertical, perpendicular (rotation 90° around Y)
 *   section         → user-defined via transform gizmo
 */

import React, { useMemo, useRef, useEffect, useState } from 'react'
import * as THREE from 'three'

const MAX_TEXTURE_SIZE = 2048

// Orientation presets applied on top of the user's rotation
const ORIENTATION_ROTATIONS = {
  'plan': [-Math.PI / 2, 0, 0],
  'elevation-front': [0, 0, 0],
  'elevation-side': [0, Math.PI / 2, 0],
  'section': [0, 0, 0], // user-controlled
}

export default function SvgPlanObject({ obj, color, isSelected, ...props }) {
  const [texture, setTexture] = useState(null)
  const meshRef = useRef()
  const svgContent = obj.svgContent
  const [svgW, svgH] = obj.svgDimensions || [0, 0]
  const opacity = obj.opacity ?? 0.8

  // Render SVG to canvas texture
  useEffect(() => {
    if (!svgContent || svgW === 0 || svgH === 0) return

    const aspect = svgW / svgH
    let canvasW, canvasH
    if (aspect >= 1) {
      canvasW = Math.min(svgW, MAX_TEXTURE_SIZE)
      canvasH = Math.round(canvasW / aspect)
    } else {
      canvasH = Math.min(svgH, MAX_TEXTURE_SIZE)
      canvasW = Math.round(canvasH * aspect)
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH

    const img = new Image()
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      const ctx = canvas.getContext('2d')
      // White background so transparent SVGs are visible
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasW, canvasH)
      ctx.drawImage(img, 0, 0, canvasW, canvasH)
      URL.revokeObjectURL(url)

      const tex = new THREE.CanvasTexture(canvas)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true
      setTexture(tex)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
    }
    img.src = url

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [svgContent, svgW, svgH])

  // Compute plane dimensions in scene units
  const planeSize = useMemo(() => {
    if (svgW === 0 || svgH === 0) return [100, 100]
    const scale = obj.svgScale
    if (scale && scale > 0) {
      // scale = pixels per scene unit
      return [svgW / scale, svgH / scale]
    }
    // No calibration — use pixel dimensions scaled down to reasonable size
    const maxDim = Math.max(svgW, svgH)
    const factor = maxDim > 500 ? 500 / maxDim : 1
    return [svgW * factor, svgH * factor]
  }, [svgW, svgH, obj.svgScale])

  // Orientation rotation (applied in addition to user rotation)
  const orientRot = ORIENTATION_ROTATIONS[obj.orientation] || [0, 0, 0]

  const edgesGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(planeSize[0], planeSize[1])),
    [planeSize]
  )

  if (!svgContent) return null

  return (
    <group {...props}>
      {/* Apply orientation rotation as inner group */}
      <group rotation={orientRot}>
        <mesh ref={meshRef}>
          <planeGeometry args={[planeSize[0], planeSize[1]]} />
          {texture ? (
            <meshBasicMaterial
              map={texture}
              transparent
              opacity={opacity}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshStandardMaterial
              color={color}
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          )}
        </mesh>
        {/* Edge outline */}
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color={isSelected ? '#ffffff' : color} linewidth={1} />
        </lineSegments>
      </group>
    </group>
  )
}
