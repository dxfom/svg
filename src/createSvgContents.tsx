import { DXF_COLOR_HEX } from '@dxfom/color/hex'
import { DxfReadonly, DxfRecordReadonly, getGroupCodeValue as $, getGroupCodeValues as $$ } from '@dxfom/dxf'
import { parseDxfMTextContent } from '@dxfom/mtext'
import { DxfTextContentElement, parseDxfTextContent } from '@dxfom/text'
import { Context } from './Context'
import { collectDimensionStyles, dimensionValueToMText } from './dimension'
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

type Vec3 = [number, number, number]

const normalizeVector3 = ([x, y, z]: Readonly<Vec3>): Vec3 => {
  const a = Math.hypot(x, y, z)
  return [x / a, y / a, z / a]
}
const crossProduct = ([a1, a2, a3]: Readonly<Vec3>, [b1, b2, b3]: Readonly<Vec3>): Vec3 => [
  a2 * b3 - a3 * b2,
  a3 * b1 - a1 * b3,
  a1 * b2 - a2 * b1,
]
const extrusionStyle = (entity: DxfRecordReadonly) => {
  const extrusionX = -$number(entity, 210, 0)
  const extrusionY = $number(entity, 220, 0)
  const extrusionZ = $number(entity, 230, 1)
  if (Math.abs(extrusionX) < 1 / 64 && Math.abs(extrusionY) < 1 / 64) {
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
  let points = ''
  for (let i = 0; i < xs.length; i++) {
    points += `${xs[i]},${ys[i]} `
  }
  return points.slice(0, -1)
}

const createEntitySvgMap: (dxf: DxfReadonly, options: CreateSvgContentStringOptions) => CreateEntitySvgMapResult = (dxf, options) => {
  const { warn, resolveColorIndex } = options
  const context = new Context(dxf, options)
  const roundCoordinate: typeof context.roundCoordinate = n => context.roundCoordinate(n)
  const $roundCoordinate = (entity: DxfRecordReadonly, groupCode: number) => roundCoordinate($(entity, groupCode))

  // prettier-ignore
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
    POLYLINE: (entity, vertices) => {
      const xs = vertices.map(v => $roundCoordinate(v, 10))
      const ys = vertices.map(v => -$roundCoordinate(v, 20))
      const flags = +($(entity, 70) ?? 0)
      const attrs = { points: polylinePoints(xs, ys), ...lineAttributes(entity) }
      return [flags & 1 ? <polygon {...attrs} /> : <polyline {...attrs} />, xs, ys]
    },
    LWPOLYLINE: entity => {
      const xs = $$(entity, 10).map(s => roundCoordinate(s))
      const ys = $$(entity, 20).map(s => -roundCoordinate(s))
      const flags = +($(entity, 70) ?? 0)
      const attrs = { points: polylinePoints(xs, ys), ...lineAttributes(entity) }
      return [flags & 1 ? <polygon {...attrs} /> : <polyline {...attrs} />, xs, ys]
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
      const rad1 = (deg1 * Math.PI) / 180
      const rad2 = (deg2 * Math.PI) / 180
      const x1 = roundCoordinate(cx + r * Math.cos(rad1))
      const y1 = roundCoordinate(cy + r * Math.sin(rad1))
      const x2 = roundCoordinate(cx + r * Math.cos(rad2))
      const y2 = roundCoordinate(cy + r * Math.sin(rad2))
      const large = (deg2 - deg1 + 360) % 360 <= 180 ? '0' : '1'
      return [<path d={`M${x1} ${-y1}A${r} ${r} 0 ${large} 0 ${x2} ${-y2}`} {...lineAttributes(entity)} />, [x1, x2], [-y1, -y2]]
    },
    ELLIPSE: entity => {
      // https://wiki.gz-labs.net/index.php/ELLIPSE
      const rad1 = $number(entity, 41, 0)
      const rad2 = $number(entity, 42, 2 * Math.PI)
      if (nearlyEqual(rad1, 0) && nearlyEqual(rad2, 2 * Math.PI)) {
        const cx = $roundCoordinate(entity, 10)
        const cy = -$roundCoordinate(entity, 20)
        const majorX = $roundCoordinate(entity, 11)
        const majorY = $roundCoordinate(entity, 21)
        const majorR = Math.hypot(majorX, majorY)
        const minorR = $number(entity, 40)! * majorR
        const radAngleOffset = -Math.atan2(majorY, majorX)
        const transform = rotate((radAngleOffset * 180) / Math.PI, cx, cy)
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
      const dimStyles = collectDimensionStyles(dxf, entity)
      let lineElements = ''
      let measurement: number
      let dominantBaseline = 'text-after-edge'
      let textAnchor = 'middle'
      let angle: number | undefined
      const tx = $roundCoordinate(entity, 11)
      const ty = -$roundCoordinate(entity, 21)
      const x0 = $roundCoordinate(entity, 10)
      const y0 = -$roundCoordinate(entity, 20)
      const xs = [tx]
      const ys = [ty]
      const dimensionType = $number(entity, 70, 0)
      switch (dimensionType & 7) {
        case 0: // Rotated, Horizontal, or Vertical
        case 1: {
          // Aligned
          const x3 = $roundCoordinate(entity, 13)
          const x4 = $roundCoordinate(entity, 14)
          const y3 = -$roundCoordinate(entity, 23)
          const y4 = -$roundCoordinate(entity, 24)
          angle = Math.round(-$number(entity, 50, 0) || 0)
          if (angle % 180 === 0) {
            measurement = Math.abs(x3 - x4)
            lineElements = <path stroke="currentColor" d={`M${x3} ${y3}L${x3} ${y0}L${x4} ${y0}L${x4} ${y4}`} />
            angle = 0
          } else {
            measurement = Math.abs(y3 - y4)
            lineElements = <path stroke="currentColor" d={`M${x3} ${y3}L${x0} ${y3}L${x0} ${y4}L${x4} ${y4}`} />
          }
          xs.push(x3, x4)
          ys.push(y3, y4)
          break
        }
        case 2: // Angular
        case 5: // Angular 3-point
          warn('Angular dimension cannot be rendered yet.', entity)
          return
        case 3: // Diameter
        case 4: {
          // Radius
          const x5 = $roundCoordinate(entity, 15)
          const y5 = -$roundCoordinate(entity, 25)
          measurement = Math.hypot(x0 - x5, y0 - y5)
          lineElements = <path stroke="currentColor" d={`M${x5} ${y5}L${tx} ${ty}`} />
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
            measurement = Math.abs(x0 - +x3!)
            lineElements = <path stroke="currentColor" d={`M${x3} ${y3}L${x3} ${y4}L${x4} ${y4}L${tx} ${ty}`} />
            angle = -90
          } else {
            measurement = Math.abs(y0 - +y3!)
            lineElements = <path stroke="currentColor" d={`M${x3} ${y3}L${x4} ${y3}L${x4} ${y4}L${tx} ${ty}`} />
          }
          dominantBaseline = 'central'
          textAnchor = 'middle'
          xs.push(x3, x4)
          ys.push(y3, y4)
          break
        }
        default:
          warn('Unknown dimension type.', entity)
          return
      }
      let textElement: string
      {
        const mtext = dimensionValueToMText(measurement, entity, dimStyles)
        const h = dimStyles.DIMTXT * dimStyles.DIMSCALE
        const textColor = dimStyles.DIMCLRT
        textElement = (
          <text
            x={tx}
            y={ty}
            fill={isNaN(textColor) ? context.color(entity) : textColor === 0 ? 'currentColor' : resolveColorIndex(textColor)}
            font-size={h}
            dominant-baseline={dominantBaseline}
            text-anchor={textAnchor}
            transform={rotate(angle, tx, ty)}
          >
            {MTEXT_contents(parseDxfMTextContent(mtext, options), options)}
          </text>
        )
      }
      return [
        <g
          color={context.color(entity)}
          stroke-width={context.strokeWidth(entity)}
          stroke-dasharray={context.strokeDasharray(entity)}
          style={extrusionStyle(entity)}
          {...addAttributes(entity)}
        >
          {lineElements + textElement}
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
      const xscale = $number(entity, 41, 1) || 1
      const yscale = $number(entity, 42, 1) || 1
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
            minX = Math.min(minX, ...xs)
            maxX = Math.max(maxX, ...xs)
            minY = Math.min(minY, ...ys)
            maxY = Math.max(maxY, ...ys)
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
