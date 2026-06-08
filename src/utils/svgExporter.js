/**
 * SVG Exporter — Produces annotated SVG with injected data-* attributes
 *
 * Takes a svgPlan object and injects all annotation metadata into
 * the SVG elements as data-* attributes. Also adds root-level
 * metadata (origin, scale, groups).
 */

/**
 * Export an annotated SVG string from a svgPlan object.
 * @param {Object} planObj - A scene object with type 'svgPlan'
 * @returns {string} Annotated SVG markup
 */
export function exportAnnotatedSvg(planObj) {
  if (!planObj?.svgContent) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(planObj.svgContent, 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg) return planObj.svgContent

  // Root-level metadata
  svg.setAttribute('data-annotator-version', '1.0')
  if (planObj.svgOrigin) {
    svg.setAttribute('data-origin-x', String(planObj.svgOrigin.x))
    svg.setAttribute('data-origin-y', String(planObj.svgOrigin.y))
  }
  if (planObj.svgScale) {
    svg.setAttribute('data-scale-px-per-unit', String(planObj.svgScale))
  }
  if (planObj.orientation) {
    svg.setAttribute('data-orientation', planObj.orientation)
  }
  if (planObj.elementGroups && planObj.elementGroups.length > 0) {
    svg.setAttribute('data-groups', JSON.stringify(planObj.elementGroups))
  }

  // Inject per-element annotations
  const annotations = planObj.annotations || {}
  Object.entries(annotations).forEach(([elementId, meta]) => {
    const el = svg.querySelector(`#${CSS.escape(elementId)}`)
    if (!el) return

    if (meta.dataType) el.setAttribute('data-type', meta.dataType)
    if (meta.dataZone) el.setAttribute('data-zone', meta.dataZone)
    if (meta.dataLayer) el.setAttribute('data-layer', meta.dataLayer)
    if (meta.dataGroup) el.setAttribute('data-group', meta.dataGroup)
    if (meta.dataTags && meta.dataTags.length > 0) {
      el.setAttribute('data-tags', meta.dataTags.join(','))
    }
  })

  const serializer = new XMLSerializer()
  return serializer.serializeToString(svg)
}
