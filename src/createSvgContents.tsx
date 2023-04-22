import { DXF_COLOR_HEX } from '@dxfom/color/hex'
import { getGroupCodeValue as $, getGroupCodeValues as $$, DxfReadonly, DxfRecordReadonly } from '@dxfom/dxf'
import { parseDxfMTextContent } from '@dxfom/mtext'
import { DxfTextContentElement, parseDxfTextContent } from '@dxfom/text'
import { Context } from './Context'
import { collectDimensionStyles, parseDimensionText } from './dimension'
import { collectHatchPathElements, hatchFill } from './hatch'
import { MTEXT_angle, MTEXT_attachmentPoint, MTEXT_contents, MTEXT_contentsOptions } from './mtext'
import { $number, $trim, escapeHtml, nearlyEqual, rotate, round, transforms, translate } from './util'

export interface CreateSvgContentStringOptions extends MTEXT_contentsOptions {
  readonly warn: (message: string, ...args: any[]) => void
  readonly resolveColorIndex: (colorIndex: number) => string
  readonly resolveLineWeight: (lineWeight: number) => number
  readonly encoding?: string | TextDecoder
  readonly addAttributes?: (entity: DxfRecordReadonly) => Record<string, string | number | boolean | undefined>
}

const defaultOptions: CreateSvgContentStringOptions = {
  warn: console.debug,
  resolveColorIndex: colorIndex => DXF_COLOR_HEX[colorIndex] ?? '#888',
  resolveLineWeight: lineWeight => (lineWeight === -3 ? 0.5 : round(lineWeight * 10, 6)),
}

const { PI, abs, cos, sin, atan2, hypot, min, max } = Math

type Vec3 = [number, number, number]

const normalizeVector3 = ([x, y, z]: Readonly<Vec3>): Vec3 => {
  const a = hypot(x, y, z)
  return [x / a, y / a, z / a]
}
const crossProduct = ([a1, a2, a3]: Readonly<Vec3>, [b1, b2, b3]: Readonly<Vec3>): Vec3 => [
  a2 * b3 - a3 * b2,
  a3 * b1 - a1 * b3,
  a1 * b2 - a2 * b1,
]
const intersectionPoint = (
  x11: number,
  y11: number,
  x12: number,
  y12: number,
  x21: number,
  y21: number,
  x22: number,
  y22: number,
): [number, number] => {
  const dx1 = x11 - x12
  const dy1 = y11 - y12
  const dx2 = x21 - x22
  const dy2 = y21 - y22
  const cc = 1 / (dx1 * dy2 - dx2 * dy1)
  const c1 = (x11 * y12 - x12 * y11) * cc
  const c2 = (x21 * y22 - x22 * y21) * cc
  return [c1 * dx2 - c2 * dx1, c1 * dy2 - c2 * dy1]
}
const extrusionStyle = (entity: DxfRecordReadonly) => {
  const extrusionX = -$number(entity, 210, 0)
  const extrusionY = $number(entity, 220, 0)
  const extrusionZ = $number(entity, 230, 1)
  if (abs(extrusionX) < 1 / 64 && abs(extrusionY) < 1 / 64) {
    return extrusionZ < 0 ? 'transform:rotateY(180deg)' : undefined
  }
  const az = normalizeVector3([extrusionX, extrusionY, extrusionZ] as const)
  const ax = normalizeVector3(crossProduct([0, 0, 1], az))
  const ay = normalizeVector3(crossProduct(az, ax))
  return `transform:matrix3d(${ax},0,${ay},0,0,0,0,0,0,0,0,1)`
}

const TEXT_textDecorations = ({ k, o, u }: DxfTextContentElement) => {
  const decorations = []
  k && decorations.push('line-through')
  o && decorations.push('overline')
  u && decorations.push('underline')
  return decorations.join(' ')
}
const TEXT_dominantBaseline = [, 'text-after-edge', 'central', 'text-before-edge']
const TEXT_textAnchor = [, 'middle', 'end', , 'middle']

interface CreateEntitySvgMapResult {
  [entityType: string]: (entity: DxfRecordReadonly, vertices: readonly DxfRecordReadonly[]) => [string, number[], number[]] | undefined
}

const polylinePoints = (xs: readonly number[], ys: readonly number[]) => {
  if (xs.length === 0) {
    return ''
  }
  let points = `${xs[0]},${ys[0]}`
  for (let i = 0; i < xs.length; i++) {
    points += ` ${xs[i]},${ys[i]}`
  }
  return points
}

const bulgedPolylinePath = (xs: readonly number[], ys: readonly number[], bulges: readonly number[]) => {
  if (xs.length === 0) {
    return ''
  }
  let path = `M${xs[0]} ${ys[0]}`
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i]
    const y = ys[i]
    const bulge = bulges[i - 1]
    if (bulge) {
      const r = hypot(x - xs[i - 1], y - ys[i - 1]) * abs(bulge + 1 / bulge) * 0.25
      const large = abs(bulge) > 1 ? '1' : '0'
      const sweep = bulge < 0 ? '1' : '0'
      path += `A${r} ${r} 0 ${large} ${sweep} ${x} ${y}`
    } else {
      path += `L${x} ${y}`
    }
  }
  return path
}

const drawPolyline = (
  xs: number[],
  ys: number[],
  bulges: number[],
  flags: number,
  attributes: Record<string, unknown>,
): [string, number[], number[]] | undefined => {
  if (bulges.some(Boolean)) {
    return [<path d={bulgedPolylinePath(xs, ys, bulges) + (flags & 1 ? 'Z' : '')} {...attributes} />, xs, ys]
  } else {
    const attrs = { points: polylinePoints(xs, ys), ...attributes }
    return [flags & 1 ? <polygon {...attrs} /> : <polyline {...attrs} />, xs, ys]
  }
}

const drawArrowEdge = (x1: number, y1: number, x2: number, y2: number, arrowSize: number): string => {
  const angle = atan2(y2 - y1, x2 - x1)
  const halfArrowAngle = (PI * 15) / 180
  return (
    <polygon
      stroke="none"
      fill="currentColor"
      points={polylinePoints(
        [x2, x2 - cos(angle - halfArrowAngle) * arrowSize, x2 - cos(angle + halfArrowAngle) * arrowSize],
        [y2, y2 - sin(angle - halfArrowAngle) * arrowSize, y2 - sin(angle + halfArrowAngle) * arrowSize],
      )}
    />
  )
}

const drawArrow = (x1: number, y1: number, x2: number, y2: number, arrowSize: number): string =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} /> + drawArrowEdge(x1, y1, x2, y2, arrowSize)

const drawDoubleArrow = (x1: number, y1: number, x2: number, y2: number, arrowSize: number): string =>
  drawArrow(x1, y1, x2, y2, arrowSize) + drawArrowEdge(x2, y2, x1, y1, arrowSize)

const createEntitySvgMap: (dxf: DxfReadonly, options: CreateSvgContentStringOptions) => CreateEntitySvgMapResult = (dxf, options) => {
  const { warn, resolveColorIndex } = options
  const context = new Context(dxf, options)
  const roundCoordinate: typeof context.roundCoordinate = n => context.roundCoordinate(n)
  const $roundCoordinate = (entity: DxfRecordReadonly, groupCode: number) => roundCoordinate($(entity, groupCode))

  const addAttributes = options.addAttributes ?? (() => undefined)
  const lineAttributes = (entity: DxfRecordReadonly) => ({
    fill: 'none',
    stroke: context.color(entity),
    'stroke-width': context.strokeWidth(entity),
    'stroke-dasharray': context.strokeDasharray(entity),
    style: extrusionStyle(entity),
    ...addAttributes(entity),
  })

  const entitySvgMap: CreateEntitySvgMapResult = {
    POINT: () => undefined,
    LINE: entity => {
      const x1 = $roundCoordinate(entity, 10)
      const x2 = $roundCoordinate(entity, 11)
      const y1 = -$roundCoordinate(entity, 20)
      const y2 = -$roundCoordinate(entity, 21)
      return [<line x1={x1} y1={y1} x2={x2} y2={y2} {...lineAttributes(entity)} />, [x1, x2], [y1, y2]]
    },
    POLYLINE: (entity, vertices) =>
      drawPolyline(
        vertices.map(v => $roundCoordinate(v, 10)),
        vertices.map(v => -$roundCoordinate(v, 20)),
        vertices.map(v => $roundCoordinate(v, 42) || 0),
        +($(entity, 70) ?? 0),
        lineAttributes(entity),
      ),
    LWPOLYLINE: entity => {
      const xs: number[] = []
      const ys: number[] = []
      const bulges: number[] = []
      for (let i = 0; i < entity.length; i++) {
        if (entity[i][0] === 10) {
          const x = +entity[i][1]
          let y: number | undefined
          let bulge = 0
          while (++i < entity.length) {
            const groupCode = entity[i][0]
            if (groupCode === 10) {
              i--
              break
            }
            if (groupCode === 20) {
              y = -entity[i][1]
            } else if (groupCode === 42) {
              bulge = +entity[i][1]
            }
          }
          if (!isNaN(x) && !isNaN(y!)) {
            xs.push(x)
            ys.push(y!)
            bulges.push(bulge)
          }
        }
      }
      return drawPolyline(xs, ys, bulges, +($(entity, 70) ?? 0), lineAttributes(entity))
    },
    CIRCLE: entity => {
      const cx = $roundCoordinate(entity, 10)
      const cy = -$roundCoordinate(entity, 20)
      const r = $roundCoordinate(entity, 40)
      return [<circle cx={cx} cy={cy} r={r} {...lineAttributes(entity)} />, [cx - r, cx + r], [cy - r, cy + r]]
    },
    ARC: entity => {
      const cx = $roundCoordinate(entity, 10)
      const cy = $roundCoordinate(entity, 20)
      const r = $roundCoordinate(entity, 40)
      const deg1 = $number(entity, 50, 0)
      const deg2 = $number(entity, 51, 0)
      const rad1 = (deg1 * PI) / 180
      const rad2 = (deg2 * PI) / 180
      const x1 = roundCoordinate(cx + r * cos(rad1))
      const y1 = roundCoordinate(cy + r * sin(rad1))
      const x2 = roundCoordinate(cx + r * cos(rad2))
      const y2 = roundCoordinate(cy + r * sin(rad2))
      const large = (deg2 - deg1 + 360) % 360 <= 180 ? '0' : '1'
      return [<path d={`M${x1} ${-y1}A${r} ${r} 0 ${large} 0 ${x2} ${-y2}`} {...lineAttributes(entity)} />, [x1, x2], [-y1, -y2]]
    },
    ELLIPSE: entity => {
      // https://wiki.gz-labs.net/index.php/ELLIPSE
      const rad1 = $number(entity, 41, 0)
      const rad2 = $number(entity, 42, 2 * PI)
      if (nearlyEqual(rad1, 0) && nearlyEqual(rad2, 2 * PI)) {
        const cx = $roundCoordinate(entity, 10)
        const cy = -$roundCoordinate(entity, 20)
        const majorX = $roundCoordinate(entity, 11)
        const majorY = $roundCoordinate(entity, 21)
        const majorR = hypot(majorX, majorY)
        const minorR = $number(entity, 40)! * majorR
        const radAngleOffset = -atan2(majorY, majorX)
        const transform = rotate((radAngleOffset * 180) / PI, cx, cy)
        return [
          <ellipse cx={cx} cy={cy} rx={majorR} ry={minorR} transform={transform} {...lineAttributes(entity)} />,
          [cx - majorR, cx + majorR],
          [cy - minorR, cy + minorR],
        ]
      } else {
        warn('Elliptical arc cannot be rendered yet.')
      }
    },
    LEADER: entity => {
      const xs = $$(entity, 10).map(s => roundCoordinate(s))
      const ys = $$(entity, 20).map(s => -roundCoordinate(s))
      return [<polyline points={polylinePoints(xs, ys)} {...lineAttributes(entity)} style={undefined} />, xs, ys]
    },
    HATCH: entity => {
      const paths = collectHatchPathElements(entity, context)
      let d = ''
      for (const { 10: xs, 20: ys } of paths) {
        d += `M${xs[0]} ${-ys[0]}`
        for (let i = 1; i < xs.length; i++) {
          d += `L${xs[i]} ${-ys[i]}`
        }
      }
      d += 'Z'
      const [fill, defs] = hatchFill(entity, paths, context)
      return [
        defs + <path d={d} fill={fill} {...addAttributes(entity)} />,
        paths.flatMap(path => path[10]),
        paths.flatMap(path => -path[20]),
      ]
    },
    SOLID: entity => {
      const x1 = $roundCoordinate(entity, 10)
      const x2 = $roundCoordinate(entity, 11)
      const x3 = $roundCoordinate(entity, 12)
      const x4 = $roundCoordinate(entity, 13)
      const y1 = -$roundCoordinate(entity, 20)
      const y2 = -$roundCoordinate(entity, 21)
      const y3 = -$roundCoordinate(entity, 22)
      const y4 = -$roundCoordinate(entity, 23)
      const d = `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}${x3 !== x4 || y3 !== y4 ? `L${x4} ${y4}` : ''}Z`
      return [<path d={d} fill={context.color(entity)} {...addAttributes(entity)} />, [x1, x2, x3, x4], [y1, y2, y3, y4]]
    },
    TEXT: entity => {
      const x = $roundCoordinate(entity, 10)
      const y = -$roundCoordinate(entity, 20)
      const h = $roundCoordinate(entity, 40)
      const angle = -$number(entity, 50)
      const contents = parseDxfTextContent($(entity, 1) || '', options)
      return [
        <text
          x={x}
          y={y}
          fill={context.color(entity)}
          font-size={h}
          dominant-baseline={TEXT_dominantBaseline[$trim(entity, 73) as string & number]}
          text-anchor={TEXT_textAnchor[$trim(entity, 72) as string & number]}
          transform={rotate(angle, x, y)}
          text-decoration={contents.length === 1 && TEXT_textDecorations(contents[0])}
          {...addAttributes(entity)}
        >
          {contents.length === 1
            ? escapeHtml(contents[0].text)
            : contents.map(content => <tspan text-decoration={TEXT_textDecorations(content)}>{escapeHtml(content.text)}</tspan>)}
        </text>,
        [x, x + h * contents.length],
        [y, y + h],
      ]
    },
    MTEXT: entity => {
      const x = $roundCoordinate(entity, 10)
      const y = -$roundCoordinate(entity, 20)
      const h = $roundCoordinate(entity, 40)
      const angle = MTEXT_angle(entity)
      const { dominantBaseline, textAnchor } = MTEXT_attachmentPoint($trim(entity, 71))
      const contents = $$(entity, 3).join('') + ($(entity, 1) ?? '')
      return [
        <text
          x={x}
          y={y}
          fill={context.color(entity)}
          font-size={h}
          dominant-baseline={dominantBaseline}
          text-anchor={textAnchor}
          transform={rotate(-angle, x, y)}
          {...addAttributes(entity)}
        >
          {MTEXT_contents(parseDxfMTextContent(contents, options), options)}
        </text>,
        [x, x + h * contents.length],
        [y, y + h],
      ]
    },
    DIMENSION: entity => {
      const dimensionType = $number(entity, 70, 0)
      const dimStyles = collectDimensionStyles(dxf, entity)
      const arrowSize = dimStyles.DIMASZ * dimStyles.DIMSCALE
      const textSize = dimStyles.DIMTXT * dimStyles.DIMSCALE
      const halfTextSize = textSize / 2
      let tx = $roundCoordinate(entity, 11)
      let ty = -$roundCoordinate(entity, 21)
      const x0 = $roundCoordinate(entity, 10)
      const y0 = -$roundCoordinate(entity, 20)
      const xs: number[] = []
      const ys: number[] = []
      let dimensionLines: string
      let textContent: string | number
      let angle: number | undefined
      switch (dimensionType & 7) {
        case 0: // Rotated, Horizontal, or Vertical
        case 1: {
          // Aligned
          const x3 = $roundCoordinate(entity, 13)
          const x4 = $roundCoordinate(entity, 14)
          const y3 = -$roundCoordinate(entity, 23)
          const y4 = -$roundCoordinate(entity, 24)
          angle = Math.round(-$number(entity, 50, 0) || 0)
          const vertical = x3 === x4 || angle % 180 !== 0
          const distance = vertical ? abs(y3 - y4) : abs(x3 - x4)
          textContent = parseDimensionText(distance, entity, dimStyles, options)
          const textWidth = halfTextSize * textContent.length
          const outside = distance < textWidth + arrowSize * 4
          if (vertical) {
            dimensionLines =
              <line x1={x3} y1={y3} x2={x0} y2={y3} /> +
              <line x1={x4} y1={y4} x2={x0} y2={y4} /> +
              (outside
                ? drawArrow(x0, y3 - arrowSize - arrowSize, x0, y3, arrowSize) +
                  drawArrow(x0, y4 + arrowSize + arrowSize, x0, y4, arrowSize)
                : drawArrow(x0, ty - (x0 === tx ? textWidth : 0), x0, y3, arrowSize) +
                  drawArrow(x0, ty + (x0 === tx ? textWidth : 0), x0, y4, arrowSize))
          } else {
            dimensionLines =
              <line x1={x3} y1={y3} x2={x3} y2={y0} /> +
              <line x1={x4} y1={y4} x2={x4} y2={y0} /> +
              (outside
                ? drawArrow(x3 - arrowSize - arrowSize, y0, x3, y0, arrowSize) +
                  drawArrow(x4 + arrowSize + arrowSize, y0, x4, y0, arrowSize)
                : drawArrow(tx - (y0 === ty ? textWidth : 0), y0, x3, y0, arrowSize) +
                  drawArrow(tx + (y0 === ty ? textWidth : 0), y0, x4, y0, arrowSize))
            angle = 0
          }
          xs.push(x3, x4)
          ys.push(y3, y4)
          break
        }
        case 2: {
          // Angular
          const x3 = $roundCoordinate(entity, 13)
          const x4 = $roundCoordinate(entity, 14)
          const x5 = $roundCoordinate(entity, 15)
          const x6 = $roundCoordinate(entity, 16)
          const y3 = -$roundCoordinate(entity, 23)
          const y4 = -$roundCoordinate(entity, 24)
          const y5 = -$roundCoordinate(entity, 25)
          const y6 = -$roundCoordinate(entity, 26)
          const [cx, cy] = intersectionPoint(x0, y0, x5, y5, x4, y4, x3, y3)
          const r = hypot(cx - x6, cy - y6)
          const angle1 = atan2(y0 - y5, x0 - x5)
          const angle2 = atan2(y4 - y3, x4 - x3)
          const xa = cx + r * cos(angle1)
          const ya = cy + r * sin(angle1)
          const xb = cx + r * cos(angle2)
          const yb = cy + r * sin(angle2)
          const clockwise = (y6 - ya) * (xb - x6) - (x6 - xa) * (yb - y6) < 0
          const rotation = ((clockwise ? angle2 - angle1 : angle1 - angle2) + (PI + PI)) % (PI + PI)
          const large = rotation > PI
          const edgeAngle = clockwise ? -0.1 : 0.1
          dimensionLines =
            <path d={`M${xa} ${ya}A${r} ${r} 0 ${large ? '1' : '0'} ${clockwise ? '1' : '0'} ${xb} ${yb}`} /> +
            drawArrowEdge(cx + r * cos(angle1 - edgeAngle), cy + r * sin(angle1 - edgeAngle), xa, ya, arrowSize) +
            drawArrowEdge(cx + r * cos(angle2 + edgeAngle), cy + r * sin(angle2 + edgeAngle), xb, yb, arrowSize)
          textContent = parseDimensionText(rotation, entity, dimStyles, options)
          if (!(dimensionType & 128) && tx === 0 && ty === 0) {
            const ta = (clockwise ? angle1 : angle2) + rotation / 2
            tx = cx + (r + textSize) * cos(ta)
            ty = cy + (r + textSize) * sin(ta)
          }
          xs.push(x3, x4, x5, x6)
          xs.push(y3, y4, y5, y6)
          break
        }
        case 5: // Angular 3-point
          warn('Angular dimension cannot be rendered yet.', entity)
          return
        case 3: {
          // Diameter
          const x5 = $roundCoordinate(entity, 15)
          const y5 = -$roundCoordinate(entity, 25)
          textContent = parseDimensionText(hypot(x0 - x5, y0 - y5), entity, dimStyles, options)
          dimensionLines = drawDoubleArrow(x0, y0, x5, y5, arrowSize)
          xs.push(x0, x5)
          ys.push(y0, y5)
          break
        }
        case 4: {
          // Radius
          const x5 = $roundCoordinate(entity, 15)
          const y5 = -$roundCoordinate(entity, 25)
          textContent = parseDimensionText(hypot(x0 - x5, y0 - y5), entity, dimStyles, options)
          dimensionLines = drawArrow(x0, y0, x5, y5, arrowSize)
          xs.push(x0, x5)
          ys.push(y0, y5)
          break
        }
        case 6: {
          // Ordinate
          const x3 = $roundCoordinate(entity, 13)
          const x4 = $roundCoordinate(entity, 14)
          const y3 = -$roundCoordinate(entity, 23)
          const y4 = -$roundCoordinate(entity, 24)
          if (dimensionType & 64) {
            textContent = parseDimensionText(abs(x0 - +x3!), entity, dimStyles, options)
            dimensionLines = <path d={`M${x3} ${y3}L${x3} ${y4}L${x4} ${y4}L${tx} ${ty}`} />
            angle = -90
          } else {
            textContent = parseDimensionText(abs(y0 - +y3!), entity, dimStyles, options)
            dimensionLines = <path d={`M${x3} ${y3}L${x4} ${y3}L${x4} ${y4}L${tx} ${ty}`} />
          }
          xs.push(x3, x4)
          ys.push(y3, y4)
          break
        }
        default:
          warn('Unknown dimension type.', entity)
          return
      }
      xs.push(tx - halfTextSize, tx + halfTextSize)
      ys.push(ty - halfTextSize, ty + halfTextSize)
      return [
        <g style={extrusionStyle(entity)} {...addAttributes(entity)}>
          <g
            color={dimStyles.DIMCLRD === 0 ? context.color(entity) : resolveColorIndex(dimStyles.DIMCLRD)}
            stroke="currentColor"
            stroke-width={context.resolveLineWeight(dimStyles.DIMLWD) || context.strokeWidth(entity)}
            stroke-dasharray={context.strokeDasharray(entity)}
          >
            {dimensionLines}
          </g>
          <text
            x={tx}
            y={ty}
            fill={dimStyles.DIMCLRT === 0 ? context.color(entity) : resolveColorIndex(dimStyles.DIMCLRT)}
            font-size={textSize}
            dominant-baseline="central"
            text-anchor="middle"
            transform={rotate(angle, tx, ty)}
          >
            {textContent}
          </text>
        </g>,
        xs,
        ys,
      ]
    },
    ACAD_TABLE: entity => {
      const cells: DxfRecordReadonly[] = []
      {
        let index = entity.findIndex(groupCode => groupCode[0] === 171)
        for (let i = index + 1; i < entity.length; i++) {
          if (entity[i][0] === 171) {
            cells.push(entity.slice(index, i))
            index = i
          }
        }
        cells.push(entity.slice(index, entity.length))
      }
      const ys = $$(entity, 141)
        .map(s => +s)
        .reduce((ys, size) => (ys.push(ys[ys.length - 1] + size), ys), [0])
      const xs = $$(entity, 142)
        .map(s => +s)
        .reduce((xs, size) => (xs.push(xs[xs.length - 1] + size), xs), [0])
      const lineColor = context.color(entity)
      const textColor = resolveColorIndex(+$(entity, 64)!)
      let s = ys.map(y => <line stroke={lineColor} x1="0" y1={y} x2={xs[xs.length - 1]} y2={y} />).join('')
      let xi = 0
      let yi = 0
      for (const cell of cells) {
        const x = xs[xi]
        const y = ys[yi]
        const color = +$(cell, 64)!
        if (!+$(cell, 173)!) {
          s += <line x1={x} y1={y} x2={x} y2={ys[yi + 1]} stroke={lineColor} />
        }
        if ($trim(cell, 171) === '2') {
          warn('Table cell type "block" cannot be rendered yet.', entity, cell)
        } else {
          s += (
            <text x={x} y={y} fill={!isNaN(color) ? resolveColorIndex(color) : textColor}>
              {MTEXT_contents(parseDxfMTextContent($(cell, 1) ?? ''), options)}
            </text>
          )
        }
        if (++xi === xs.length - 1) {
          xi = 0
          yi++
        }
      }
      s += <line x1={xs[xs.length - 1]} y1="0" x2={xs[xs.length - 1]} y2={ys[ys.length - 1]} stroke={lineColor} />
      const x = $roundCoordinate(entity, 10)
      const y = -$roundCoordinate(entity, 20)
      return [
        <g font-size={$trim(entity, 140)} dominant-baseline="text-before-edge" transform={translate(x, y)} {...addAttributes(entity)}>
          {s}
        </g>,
        xs.map(_x => _x + x),
        ys.map(_y => _y + y),
      ]
    },
    INSERT: entity => {
      const x = $roundCoordinate(entity, 10)
      const y = -$roundCoordinate(entity, 20)
      const angle = -$number(entity, 50)
      const xscale = $number(entity, 41) || 1
      const yscale = $number(entity, 42) || 1
      const transform = transforms(rotate(angle, x, y), translate(x, y), xscale !== 1 || yscale !== 1 ? `scale(${xscale},${yscale})` : '')
      const _block = dxf.BLOCKS?.[$(entity, 2)!]
      const block = _block?.slice($(_block[0], 0) === 'BLOCK' ? 1 : 0, $(_block[_block.length - 1], 0) === 'ENDBLK' ? -1 : undefined)
      const [contents, bbox] = entitiesSvg(block, entitySvgMap, options)
      return [
        <g color={context._color(entity)} transform={transform} {...lineAttributes(entity)}>
          {contents}
        </g>,
        [x + bbox.x * xscale, x + (bbox.x + bbox.w) * xscale],
        [y + bbox.y * yscale, y + (bbox.y + bbox.h) * yscale],
      ]
    },
  }
  return entitySvgMap
}

const entitiesSvg = (entities: DxfReadonly['ENTITIES'], entitySvgMap: CreateEntitySvgMapResult, options: CreateSvgContentStringOptions) => {
  const { warn } = options
  let s = ''
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  if (entities) {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]
      const entityType = $(entity, 0)
      if (!entityType) {
        continue
      }
      const vertices: NonNullable<DxfReadonly['ENTITIES']>[0][] = []
      while ($(entities[i + 1], 0) === 'VERTEX') {
        vertices.push(entities[++i])
      }
      if (vertices.length !== 0 && $(entities[i + 1], 0) === 'SEQEND') {
        i++
      }
      try {
        const entitySvg = entitySvgMap[entityType]
        if (entitySvg) {
          const svg = entitySvg(entity, vertices)
          if (svg) {
            s += svg[0]
            const xs = svg[1].filter(x => isFinite(x))
            const ys = svg[2].filter(y => isFinite(y))
            minX = min(minX, ...xs)
            maxX = max(maxX, ...xs)
            minY = min(minY, ...ys)
            maxY = max(maxY, ...ys)
          }
        } else {
          warn(`Unknown entity type: ${entityType}`, entity)
        }
      } catch (error) {
        warn(`Error occurred: ${error}`, entity)
      }
    }
  }
  return [s, { x: minX, y: minY, w: maxX - minX, h: maxY - minY }] as const
}

export const createSvgContents = (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions>) => {
  const resolvedOptions = options ? { ...defaultOptions, ...options } : defaultOptions
  return entitiesSvg(dxf.ENTITIES, createEntitySvgMap(dxf, resolvedOptions), resolvedOptions)
}
