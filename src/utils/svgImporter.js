/**
 * SVG Importer — Parses and sanitizes SVG files for import
 *
 * - Strips script tags and event handler attributes for security
 * - Auto-assigns IDs to elements that lack them
 * - Extracts viewBox or width/height for dimensions
 */

const SELECTABLE_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'path', 'text', 'image', 'use', 'g',
])

const EVENT_ATTR_PATTERN = /^on[a-z]/i

let _svgIdCounter = 0

/**
 * Parse and sanitize an SVG string for import into the scene.
 * @param {string} svgString - Raw SVG file content
 * @returns {{ cleanedSvg: string, dimensions: [number, number], elementCount: number }}
 */
export function parseSvgForImport(svgString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) throw new Error('No <svg> element found in file')

  // Remove script elements
  svg.querySelectorAll('script').forEach(el => el.remove())

  // Remove event handler attributes from all elements
  const allElements = svg.querySelectorAll('*')
  allElements.forEach(el => {
    const attrs = Array.from(el.attributes)
    attrs.forEach(attr => {
      if (EVENT_ATTR_PATTERN.test(attr.name)) {
        el.removeAttribute(attr.name)
      }
    })
    // Remove href attributes pointing to javascript:
    const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (href && href.trim().toLowerCase().startsWith('javascript:')) {
      el.removeAttribute('href')
      el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
    }
  })

  // Extract dimensions from viewBox or width/height
  let width = 0
  let height = 0
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number)
    if (parts.length === 4) {
      width = parts[2]
      height = parts[3]
    }
  }
  if (!width || !height) {
    width = parseFloat(svg.getAttribute('width')) || 800
    height = parseFloat(svg.getAttribute('height')) || 600
  }

  // Ensure the SVG has width/height attributes for canvas rendering
  if (!svg.getAttribute('width')) svg.setAttribute('width', String(width))
  if (!svg.getAttribute('height')) svg.setAttribute('height', String(height))

  // Auto-assign IDs to selectable elements that lack them
  let elementCount = 0
  allElements.forEach(el => {
    const tag = el.tagName.toLowerCase()
    if (!SELECTABLE_TAGS.has(tag)) return
    elementCount++
    if (!el.id) {
      el.id = `svg-el-${_svgIdCounter++}`
    }
  })

  const serializer = new XMLSerializer()
  const cleanedSvg = serializer.serializeToString(svg)

  return {
    cleanedSvg,
    dimensions: [width, height],
    elementCount,
  }
}

/**
 * Auto-detect element types based on ID patterns and attributes.
 * Returns a map of elementId -> suggested metadata.
 */
export function autoDetectElements(svgString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return {}

  const suggestions = {}
  const allElements = svg.querySelectorAll('*')

  allElements.forEach(el => {
    if (!el.id) return
    const id = el.id.toLowerCase()
    const tag = el.tagName.toLowerCase()
    const suggestion = {}

    // Pattern-based type detection
    if (/zone|area|region/i.test(id)) {
      suggestion.dataType = 'zone'
    } else if (/panel|light|led|lamp|display/i.test(id)) {
      suggestion.dataType = 'actuator'
    } else if (/cam|sensor|mic|detect/i.test(id)) {
      suggestion.dataType = 'sensor'
    } else if (/wall|floor|ceil|column|door|window|stair/i.test(id)) {
      suggestion.dataType = 'structural'
    } else if (/marker|ref|calib|origin/i.test(id)) {
      suggestion.dataType = 'reference'
    }

    // Layer detection from existing attributes
    const dataLayer = el.getAttribute('data-layer')
    if (dataLayer) suggestion.dataLayer = dataLayer

    const dataZone = el.getAttribute('data-zone')
    if (dataZone) suggestion.dataZone = dataZone

    const dataType = el.getAttribute('data-type')
    if (dataType) suggestion.dataType = dataType

    if (Object.keys(suggestion).length > 0) {
      suggestions[el.id] = suggestion
    }
  })

  return suggestions
}
