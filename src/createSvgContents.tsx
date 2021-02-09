import { DXF_COLOR_HEX } from '@dxfom/color/hex'
import { DxfReadonly, DxfRecordReadonly, getGroupCodeValue as $, getGroupCodeValues as $$ } from '@dxfom/dxf'
import { parseDxfMTextContent } from '@dxfom/mtext'
import { decodeDxfTextCharacterCodes, DxfTextContentElement, parseDxfTextContent } from '@dxfom/text'
import { collectDimensionStyleOverrides } from './dstyle'
import { MTEXT_angle, MTEXT_attachmentPoint, MTEXT_contents, MTEXT_contentsOptions } from './mtext'
import { $negates, $number, $numbers, $trim, nearlyEqual, norm, round, trim } from './util'

export interface CreateSvgContentStringOptions extends MTEXT_contentsOptions {
  readonly warn: (message: string, ...args: any[]) => void
  readonly resolveColorIndex: (colorIndex: number) => string
  readonly encoding?: string | TextDecoder
}

const defaultOptions: CreateSvgContentStringOptions = {
  warn: console.debug,
  resolveColorIndex: (index: number) => DXF_COLOR_HEX[index] ?? '#888',
}

const commonAttributes = (entity: DxfRecordReadonly) => ({
  'data-5': $trim(entity, 5)
})

const textDecorations = ({ k, o, u }: DxfTextContentElement) => {
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

const polylinePath = (xs: readonly number[], ys: readonly number[], close?: unknown) => {
  let d = ''
  for (let i = 0; i < xs.length; i++) {
    d += `${d ? 'L' : 'M'}${xs[i]} ${ys[i]}`
  }
  if (close) {
    d += 'Z'
  }
  return d
}

const createEntitySvgMap: (dxf: DxfReadonly, options: CreateSvgContentStringOptions) => CreateEntitySvgMapResult = (dxf, options) => {
  const { warn, resolveColorIndex } = options
  const layerMap: Record<string, undefined | { color: string; ltype?: string }> = {}
  for (const layer of dxf.TABLES?.LAYER ?? []) {
    if ($(layer, 0) === 'LAYER') {
      layerMap[$(layer, 2)!] = { color: resolveColorIndex(+$(layer, 62)!), ltype: $(layer, 6) }
    }
  }

  const ltypeMap: Record<string, undefined | { strokeDasharray: string }> = {}
  for (const ltype of dxf.TABLES?.LTYPE ?? []) {
    if ($(ltype, 0) === 'LTYPE') {
      const _strokeDasharray = $$(ltype, 49).map(trim).map(s => s!.startsWith('-') ? s!.slice(1) : s!)
      const strokeDasharray =
        _strokeDasharray.length === 0 || _strokeDasharray.length % 2 === 1
          ? _strokeDasharray
          : _strokeDasharray[0] === '0'
          ? _strokeDasharray.slice(1)
          : _strokeDasharray.concat('0')
      strokeDasharray.length !== 0 && (ltypeMap[$(ltype, 2)!] = { strokeDasharray: strokeDasharray.join(' ') })
    }
  }

  const _color = (entity: DxfRecordReadonly) => {
    const colorIndex = $trim(entity, 62)
    if (colorIndex === '0') {
      return 'currentColor'
    }
    if (colorIndex && colorIndex !== '256') {
      return resolveColorIndex(+colorIndex)
    }
    const layer = layerMap[$trim(entity, 8)!]
    if (layer) {
      return layer.color
    }
  }
  const color = (entity: DxfRecordReadonly) => _color(entity) || 'currentColor'

  const strokeDasharray = (entity: DxfRecordReadonly) => ltypeMap[$(entity, 6) ?? layerMap[$(entity, 8)!]?.ltype!]?.strokeDasharray
  const extrusionStyle = (entity: DxfRecordReadonly) => {
    const extrusionZ = +$trim(entity, 230)!
    if (extrusionZ && Math.abs(extrusionZ + 1) < 1 / 64) {
      return 'transform:rotateY(180deg)'
    }
  }

  return {
    POINT: () => undefined,
    LINE: entity => {
      const xs = $numbers(entity, 10, 11)
      const ys = $negates(entity, 20, 21)
      return [
        <line
          {...commonAttributes(entity)}
          x1={xs[0]}
          y1={ys[0]}
          x2={xs[1]}
          y2={ys[1]}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />,
        xs,
        ys,
      ]
    },
    POLYLINE: (entity, vertices) => {
      const xs = vertices.map(v => $number(v, 10))
      const ys = vertices.map(v => -$number(v, 20))
      const flags = +($(entity, 70) ?? 0)
      return [
        <path
          {...commonAttributes(entity)}
          d={polylinePath(xs, ys, flags & 1)}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />,
        xs,
        ys,
      ]
    },
    LWPOLYLINE: entity => {
      const xs = $$(entity, 10).map(s => +s)
      const ys = $$(entity, 20).map(s => -s)
      const flags = +($(entity, 70) ?? 0)
      return [
        <path
          {...commonAttributes(entity)}
          d={polylinePath(xs, ys, flags & 1)}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />,
        xs,
        ys,
      ]
    },
    CIRCLE: entity => {
      const [cx, cy, r] = $numbers(entity, 10, 20, 40)
      return [
        <circle
          {...commonAttributes(entity)}
          cx={cx}
          cy={-cy}
          r={r}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />,
        [cx - r, cx + r],
        [-cy - r, -cy + r],
      ]
    },
    ARC: entity => {
      const [cx, cy, r] = $numbers(entity, 10, 20, 40)
      const deg1 = $number(entity, 50, 0)
      const deg2 = $number(entity, 51, 0)
      const rad1 = deg1 * Math.PI / 180
      const rad2 = deg2 * Math.PI / 180
      const x1 = cx + r * Math.cos(rad1)
      const y1 = cy + r * Math.sin(rad1)
      const x2 = cx + r * Math.cos(rad2)
      const y2 = cy + r * Math.sin(rad2)
      const large = (deg2 - deg1 + 360) % 360 <= 180 ? '0' : '1'
      return [
        <path
          {...commonAttributes(entity)}
          d={`M${x1} ${-y1}A${r} ${r} 0 ${large} 0 ${x2} ${-y2}`}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />,
        [x1, x2],
        [-y1, -y2],
      ]
    },
    ELLIPSE: entity => {
      // https://wiki.gz-labs.net/index.php/ELLIPSE
      const [cx, cy, majorX, majorY] = $numbers(entity, 10, 20, 11, 21)
      const majorR = norm(majorX, majorY)
      const minorR = $number(entity, 40)! * majorR
      const radAngleOffset = -Math.atan2(majorY, majorX)
      const rad1 = $number(entity, 41, 0)
      const rad2 = $number(entity, 42, 2 * Math.PI)
      if (nearlyEqual(rad1, 0) && nearlyEqual(rad2, 2 * Math.PI)) {
        return [
          <ellipse
            {...commonAttributes(entity)}
            cx={cx}
            cy={-cy}
            rx={majorR}
            ry={minorR}
            stroke={color(entity)}
            stroke-dasharray={strokeDasharray(entity)}
            transform={radAngleOffset && `rotate(${radAngleOffset * 180 / Math.PI} ${cx} ${-cy})`}
            style={extrusionStyle(entity)}
          />,
          [cx - majorR, cx + majorR],
          [-cy - minorR, -cy + minorR],
        ]
      } else {
        warn('Elliptical arc cannot be rendered yet.')
      }
    },
    LEADER: entity => {
      const xs = $$(entity, 10).map(s => +s)
      const ys = $$(entity, 20).map(s => -s)
      return [
        <path
          {...commonAttributes(entity)}
          d={polylinePath(xs, ys)}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
        />,
        xs,
        ys,
      ]
    },
    HATCH: entity => {
      const paths = entity.slice(
        entity.findIndex(groupCode => groupCode[0] === 92),
        entity.findIndex(groupCode => groupCode[0] === 97),
      )
      const x1s = $$(paths, 10).map(s => +s)
      const y1s = $$(paths, 20).map(s => -s)
      const x2s = $$(paths, 11).map(s => +s)
      const y2s = $$(paths, 21).map(s => -s)
      let d = ''
      for (let i = 0; i < x1s.length; i++) {
        if (!x2s[i]) {
          d += `${i === 0 ? 'M' : 'L'}${x1s[i]} ${y1s[i]}`
        } else if (x1s[i] === x2s[i - 1] && y1s[i] === y2s[i - 1]) {
          d += `L${x2s[i]} ${y2s[i]}`
        } else {
          d += `M${x1s[i]} ${y1s[i]}L${x2s[i]} ${y2s[i]}`
        }
      }
      return [
        <path {...commonAttributes(entity)} d={d} fill={color(entity)} fill-opacity='.3' />,
        [...x1s, ...x2s],
        [...y1s, ...y2s],
      ]
    },
    SOLID: entity => {
      const [x1, x2, x3, x4] = $numbers(entity, 10, 11, 12, 13)
      const [y1, y2, y3, y4] = $negates(entity, 20, 21, 22, 23)
      const d = `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}${x3 !== x4 || y3 !== y4 ? `L${x4} ${y4}` : ''}Z`
      return [
        <path {...commonAttributes(entity)} d={d} fill={color(entity)} />,
        [x1, x2, x3, x4],
        [y1, y2, y3, y4],
      ]
    },
    TEXT: entity => {
      const [x, h] = $numbers(entity, 10, 40)
      const [y, angle] = $negates(entity, 20, 50)
      const contents = parseDxfTextContent($(entity, 1) || '', options)
      return [
        <text
          {...commonAttributes(entity)}
          x={x}
          y={y}
          fill={color(entity)}
          font-size={h}
          dominant-baseline={TEXT_dominantBaseline[$trim(entity, 73) as string & number]}
          text-anchor={TEXT_textAnchor[$trim(entity, 72) as string & number]}
          transform={angle && `rotate(${angle} ${x} ${y})`}
          text-decoration={contents.length === 1 && textDecorations(contents[0])}
        >
          {
            contents.length === 1
              ? contents[0].text
              : contents.map(content => <tspan text-decoration={textDecorations(content)}>{content.text}</tspan>)
          }
        </text>,
        [x, x + h * contents.length],
        [y, y + h],
      ]
    },
    MTEXT: entity => {
      const [x, h] = $numbers(entity, 10, 40)
      const y = -$number(entity, 20)
      const angle = MTEXT_angle(entity)
      const { dominantBaseline, textAnchor } = MTEXT_attachmentPoint($trim(entity, 71))
      const contents = $$(entity, 3).join('') + ($(entity, 1) ?? '')
      return [
        <text
          {...commonAttributes(entity)}
          x={x}
          y={y}
          fill={color(entity)}
          font-size={h}
          dominant-baseline={dominantBaseline}
          text-anchor={textAnchor}
          transform={angle ? `rotate(${-angle} ${x} ${y})` : undefined}
        >
          {MTEXT_contents(parseDxfMTextContent(contents, options), options)}
        </text>,
        [x, x + h * contents.length],
        [y, y + h],
      ]
    },
    DIMENSION: entity => {
      const styleName = $(entity, 3)
      const style = dxf.TABLES?.DIMSTYLE?.find(style => $(style, 2) === styleName)
      const styleOverrides = collectDimensionStyleOverrides(entity)
      const $style = (key: number, defaultValue: number) => +(styleOverrides?.get(key) ?? $(style, key) ?? defaultValue)
      let lineElements = ''
      let value = $number(entity, 42, NaN)
      let dominantBaseline = 'text-after-edge'
      let textAnchor = 'middle'
      let angle: number | undefined
      value === -1 && (value = NaN)
      const factor = $style(144, 1)
      const tx = $number(entity, 11)
      const ty = -$number(entity, 21)
      const xs = [tx]
      const ys = [ty]
      const dimensionType = $number(entity, 70, 0)
      switch (dimensionType & 7) {
        case 0: // Rotated, Horizontal, or Vertical
        case 1: // Aligned
        {
          const [x0, x1, x2] = $numbers(entity, 10, 13, 14)
          const [y0, y1, y2] = $negates(entity, 20, 23, 24)
          angle = Math.round(-$number(entity, 50, 0) || 0)
          if (angle % 180 === 0) {
            value = value || Math.abs(x1 - x2) * factor
            lineElements = <path stroke="currentColor" d={`M${x1} ${y1}L${x1} ${y0}L${x2} ${y0}L${x2} ${y2}`} />
            angle = 0
          } else {
            value = value || Math.abs(y1 - y2) * factor
            lineElements = <path stroke="currentColor" d={`M${x1} ${y1}L${x0} ${y1}L${x0} ${y2}L${x2} ${y2}`} />
          }
          xs.push(x1, x2)
          ys.push(y1, y2)
          break
        }
        case 2: // Angular
        case 5: // Angular 3-point
          warn('Angular dimension cannot be rendered yet.', entity)
          break
        case 3: // Diameter
        case 4: // Radius
          warn('Diameter / radius dimension cannot be rendered yet.', entity)
          break
        case 6: // Ordinate
        {
          const [x1, x2] = $numbers(entity, 13, 14)
          const [y1, y2] = $negates(entity, 23, 24)
          if (dimensionType & 64) {
            const x0 = $number(entity, 10)
            value = value || Math.abs(x0 - +x1!) * factor
            lineElements = <path stroke="currentColor" d={`M${x1} ${y1}L${x1} ${y2}L${x2} ${y2}L${tx} ${ty}`} />
            angle = -90
          } else {
            const y0 = -$number(entity, 20)
            value = value || Math.abs(y0 - +y1!) * factor
            lineElements = <path stroke="currentColor" d={`M${x1} ${y1}L${x2} ${y1}L${x2} ${y2}L${tx} ${ty}`} />
          }
          dominantBaseline = 'central'
          textAnchor = 'middle'
          xs.push(x1, x2)
          ys.push(y1, y2)
          break
        }
      }
      value = round(value, $style(271, 0) || +$(dxf.HEADER?.$DIMDEC, 70)! || 4)
      let textElement: string
      {
        const h = ($style(140, 0) || +$(dxf.HEADER?.$DIMTXT, 40)!) * ($style(40, 0) || +$(dxf.HEADER?.$DIMSCALE, 40)! || 1)
        let valueWithTolerance = String(value)
        if ($style(71, 0)) {
          const p = $style(47, 0)
          const n = $style(48, 0)
          if (p || n) {
            if (p === n) {
              valueWithTolerance = `${value}  ±${p}`
            } else {
              valueWithTolerance = `${value}  {\\S${p ? '+' + p : ' 0'}^${-n || ' 0'};}`
            }
          }
        }
        const template = $(entity, 1)
        const text = template
          ? decodeDxfTextCharacterCodes(template, options?.encoding).replace(/<>/, valueWithTolerance)
          : valueWithTolerance
        const textColor = $style(178, NaN)
        textElement =
          <text
            x={tx}
            y={ty}
            fill={isNaN(textColor) ? color(entity) : textColor === 0 ? 'currentColor' : resolveColorIndex(textColor)}
            font-size={h}
            dominant-baseline={dominantBaseline}
            text-anchor={textAnchor}
            transform={angle && `rotate(${angle} ${tx} ${ty})`}
          >
            {MTEXT_contents(parseDxfMTextContent(text), options)}
          </text>
      }
      return [
        <g
          {...commonAttributes(entity)}
          color={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
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
      const ys = $$(entity, 141).map(s => +s).reduce((ys, size) => (ys.push(ys[ys.length - 1] + size), ys), [0])
      const xs = $$(entity, 142).map(s => +s).reduce((xs, size) => (xs.push(xs[xs.length - 1] + size), xs), [0])
      const lineColor = color(entity)
      const textColor = resolveColorIndex(+$(entity, 64)!)
      let s = ys.map(y => <line stroke={lineColor} x1='0' y1={y} x2={xs[xs.length - 1]} y2={y} />).join('')
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
          s +=
            <text x={x} y={y} fill={!isNaN(color) ? resolveColorIndex(color) : textColor}>
              {MTEXT_contents(parseDxfMTextContent($(cell, 1) ?? ''), options)}
            </text>
        }
        if (++xi === xs.length - 1) {
          xi = 0
          yi++
        }
      }
      s +=
        <line
          x1={xs[xs.length - 1]}
          y1='0'
          x2={xs[xs.length - 1]}
          y2={ys[ys.length - 1]}
          stroke={lineColor}
        />
      const x = $number(entity, 10)
      const y = -$number(entity, 20)
      return [
        <g
          {...commonAttributes(entity)}
          font-size={$trim(entity, 140)}
          dominant-baseline='text-before-edge'
          transform={`translate(${x},${y})`}
        >
          {s}
        </g>,
        xs.map(_x => _x + x),
        ys.map(_y => _y + y),
      ]
    },
    INSERT: entity => {
      const x = $number(entity, 10, 0)
      const y = -$number(entity, 20, 0)
      const rotate = -$number(entity, 50)
      const xscale = $number(entity, 41, 1) || 1
      const yscale = $number(entity, 42, 1) || 1
      const transform = [
        x || y ? `translate(${x},${y})` : '',
        xscale !== 1 || yscale !== 1 ? `scale(${xscale},${yscale})` : '',
        rotate ? `rotate(${rotate})` : ''
      ].filter(Boolean).join(' ')
      const _block = dxf.BLOCKS?.[$(entity, 2)!]
      const block = _block?.slice(
        $(_block[0], 0) === 'BLOCK' ? 1 : 0,
        $(_block[_block.length - 1], 0) === 'ENDBLK' ? -1 : undefined,
      )
      const [contents, bbox] = entitiesSvg(dxf, block, options)
      return [
        <g {...commonAttributes(entity)} color={_color(entity)} transform={transform}>{contents}</g>,
        [x + bbox.x, x + bbox.x + bbox.w * xscale],
        [y + bbox.y, y + bbox.y + bbox.h * yscale],
      ]
    },
  }
}

const entitiesSvg = (dxf: DxfReadonly, entities: DxfReadonly['ENTITIES'], options: CreateSvgContentStringOptions) => {
  const { warn } = options
  const entitySvgMap = createEntitySvgMap(dxf, options)
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
  return entitiesSvg(dxf, dxf.ENTITIES, resolvedOptions)
}
