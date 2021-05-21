import { DxfRecordReadonly, getGroupCodeValue as $, getGroupCodeValues as $$ } from '@dxfom/dxf'
import { Context } from './Context'
import { $number, $trim, resolveStrokeDasharray, rotate, round as _round, transforms, translate } from './util'

const round = (n: number | string) => _round(n, 6)

interface HatchPathElement {
  10: number[]
  20: number[]
}

interface HatchPatternElement {
  53: number
  43: number
  44: number
  45: number
  46: number
  49: number[]
}

export const collectHatchPathElements = (hatch: DxfRecordReadonly, context: Context): HatchPathElement[] => {
  const index = hatch.findIndex(groupCode => groupCode[0] === 91)
  if (index === -1) {
    return []
  }
  const paths: HatchPathElement[] = []
  let currentPath: HatchPathElement | undefined
  for (let i = index + 1; hatch[i] && hatch[i][0] !== 98; i++) {
    const groupCode = hatch[i][0]
    switch (groupCode) {
      case 92:
        paths.push((currentPath = { 10: [], 20: [] }))
        break
      case 10:
      case 20:
        currentPath?.[groupCode].push(context.roundCoordinate(hatch[i][1]))
        break
    }
  }
  return paths
}

const collectHatchPatternElements = (hatch: DxfRecordReadonly): HatchPatternElement[] => {
  const index = hatch.findIndex(groupCode => groupCode[0] === 78)
  if (index === -1) {
    return []
  }
  const patterns: HatchPatternElement[] = []
  let currentPattern: HatchPatternElement | undefined
  for (let i = index + 1; hatch[i]; i++) {
    const groupCode = hatch[i][0]
    const value = round(hatch[i][1])
    switch (groupCode) {
      case 53:
        patterns.push((currentPattern = { 53: value, 43: 0, 44: 0, 45: 0, 46: 0, 49: [] }))
        break
      case 43:
      case 44:
      case 45:
      case 46:
        currentPattern && (currentPattern[groupCode] = value)
        break
      case 49:
        currentPattern?.[49].push(value)
        break
      case 79:
        break
      default:
        return patterns
    }
  }
  return patterns
}

const hatchGradientDefs: Record<
  string,
  (id: string, colors: readonly [string, string], hatch: DxfRecordReadonly, paths: readonly HatchPathElement[]) => string
> = {
  LINEAR: (id, colors, hatch) => {
    const angle = round(($number(hatch, 460) * 180) / Math.PI)
    return (
      <linearGradient id={id} x2="1" y2="0" gradientTransform={rotate(-angle, 0.5, 0.5)}>
        <stop stop-color={colors[0]} />
        <stop stop-color={colors[1]} offset="1" />
      </linearGradient>
    )
  },
  CYLINDER: (id, colors, hatch) => {
    const angle = round(($number(hatch, 460) * 180) / Math.PI)
    return (
      <linearGradient id={id} x2="1" y2="0" gradientTransform={rotate(-angle, 0.5, 0.5)}>
        <stop stop-color={colors[0]} />
        <stop stop-color={colors[1]} offset=".5" />
        <stop stop-color={colors[0]} offset="1" />
      </linearGradient>
    )
  },
  INVCYLINDER: (id, colors, hatch, paths) => hatchGradientDefs.CYLINDER(id, [colors[1], colors[0]], hatch, paths),
  SPHERICAL: (id, colors, _, paths) => {
    const xs = paths.flatMap(({ 10: x }) => x)
    const ys = paths.flatMap(({ 20: y }) => y)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    return (
      <radialGradient
        id={id}
        cx={(xMin + xMax) / 2}
        cy={-(yMin + yMax) / 2}
        r={Math.max(xMax - xMin, yMax - yMin) / 2}
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color={colors[1]} />
        <stop stop-color={colors[0]} offset="1" />
      </radialGradient>
    )
  },
  INVSPHERICAL: (id, colors, hatch, paths) => hatchGradientDefs.SPHERICAL(id, [colors[1], colors[0]], hatch, paths),
  HEMISPHERICAL: (id, colors) => (
    <radialGradient id={id} cy="1" gradientTransform="translate(-.75,-1.5) scale(2.5)">
      <stop stop-color={colors[1]} />
      <stop stop-color={colors[0]} offset="1" />
    </radialGradient>
  ),
  INVHEMISPHERICAL: (id, colors, hatch, paths) => hatchGradientDefs.HEMISPHERICAL(id, [colors[1], colors[0]], hatch, paths),
  CURVED: (id, colors) => (
    <radialGradient id={id} cy="1" gradientTransform="translate(-1,-2) scale(3)">
      <stop stop-color={colors[1]} />
      <stop stop-color={colors[0]} offset="1" />
    </radialGradient>
  ),
  INVCURVED: (id, colors, hatch, paths) => hatchGradientDefs.CURVED(id, [colors[1], colors[0]], hatch, paths),
}

export const hatchFill = (hatch: DxfRecordReadonly, paths: readonly HatchPathElement[], context: Context): [string, string] => {
  const fillColor = context.color(hatch)
  if ($trim(hatch, 450) === '1') {
    // gradient
    const id = `hatch-gradient-${$(hatch, 5)}`
    const colorIndices = $$(hatch, 63)
    const colors = [context.resolveColorIndex(+colorIndices[0] || 5), context.resolveColorIndex(+colorIndices[1] || 2)] as const
    const gradientPatternName = $trim(hatch, 470)
    const defs = gradientPatternName && hatchGradientDefs[gradientPatternName]?.(id, colors, hatch, paths)
    return defs ? [`url(#${id})`, `<defs>${defs}</defs>`] : [fillColor, '']
  } else if ($trim(hatch, 70) === '1') {
    // solid
    return [fillColor, '']
  } else {
    // pattern
    const patternElements = collectHatchPatternElements(hatch)
    if (patternElements.length === 0) {
      return [fillColor, '']
    }
    const handle = $(hatch, 5)
    const id = `hatch-pattern-${handle}`
    const bgGroupCodeIndex = hatch.findIndex(([groupCode, value]) => groupCode === 1001 && value === 'HATCHBACKGROUNDCOLOR')
    const bgColorIndex = bgGroupCodeIndex !== -1 && +hatch[bgGroupCodeIndex + 1][1] & 255
    const bgColor = bgColorIndex && context.resolveColorIndex(bgColorIndex)
    return [
      `url(#${id})`,
      <defs>
        {patternElements.map(({ 53: angle, 43: xBase, 44: yBase, 45: xOffset, 46: yOffset, 49: strokeDasharray }, i) => {
          strokeDasharray = resolveStrokeDasharray(strokeDasharray)
          const height = round(Math.hypot(xOffset, yOffset))
          const width = round(strokeDasharray.reduce((x, y) => x + y, 0)) || 256
          const transform = transforms(translate(xBase, -yBase), rotate(-angle))
          return (
            <pattern id={`${id}-${i}`} width={width} height={height} patternUnits="userSpaceOnUse" patternTransform={transform}>
              <line x2={width} stroke-width="1" stroke={fillColor} stroke-dasharray={strokeDasharray.join(' ')} />
            </pattern>
          )
        })}
        <pattern id={id} width={256} height={256} patternUnits="userSpaceOnUse">
          {bgColor ? <rect fill={bgColor} width={256} height={256} /> : ''}
          {patternElements.map((_, i) => (
            <rect fill={`url(#hatch-pattern-${handle}-${i})`} width={256} height={256} />
          ))}
        </pattern>
      </defs>,
    ]
  }
}
