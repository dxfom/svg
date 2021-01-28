import { DXF_COLOR_HEX } from '@dxfom/color/hex'
import { DxfReadonly, DxfRecordReadonly, getGroupCodeValue as $, getGroupCodeValues as $$ } from '@dxfom/dxf'
import { DxfMTextContentElement, parseDxfMTextContent } from '@dxfom/mtext'
import { DxfTextContentElement, parseDxfTextContent } from '@dxfom/text'

export interface CreateSvgContentStringOptions {
  readonly warn: (message: string, ...args: any[]) => void
  readonly resolveColorIndex: (colorIndex: number) => string
}

const defaultOptions: CreateSvgContentStringOptions = {
  warn: console.debug,
  resolveColorIndex: (index: number) => DXF_COLOR_HEX[index] ?? '#888',
}

const smallNumber = 1 / 64
const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < smallNumber
const round = (() => {
  const _shift = (n: number, precision: number): number => {
    const [d, e] = ('' + n).split('e')
    return +(d + 'e' + (e ? +e + precision : precision))
  }
  return (n: number, precision: number) => _shift(Math.round(_shift(n, precision)), -precision)
})()

const trim = (s: string | undefined) => s ? s.trim() : s
const negate = (s: string | undefined) => !s ? s : s.startsWith('-') ? s.slice(1) : '-' + s
const $trim = (record: DxfRecordReadonly | undefined, groupCode: number) => trim($(record, groupCode))
const $negate = (record: DxfRecordReadonly | undefined, groupCode: number) => negate(trim($(record, groupCode)))
const $number = (record: DxfRecordReadonly | undefined, groupCode: number, defaultValue?: number) => {
  const value = +$(record, groupCode)!
  if (!isNaN(value)) {
    return value
  }
  if (defaultValue === undefined) {
    return NaN
  }
  return defaultValue
}

const textDecorations = ({ k, o, u }: DxfTextContentElement) => {
  const decorations = []
  k && decorations.push('line-through')
  o && decorations.push('overline')
  u && decorations.push('underline')
  return decorations.join(' ')
}

const TEXT_dominantBaseline = [, 'text-after-edge', 'central', 'text-before-edge']
const TEXT_textAnchor = [, 'middle', 'end', , 'middle']

const MTEXT_attachmentPoint = (n: string | number | undefined) => {
  n = +n!
  let dominantBaseline: string | undefined
  let textAnchor: string | undefined
  switch (n) {
    case 1:
    case 2:
    case 3:
      dominantBaseline = 'text-before-edge'
      break
    case 4:
    case 5:
    case 6:
      dominantBaseline = 'central'
      break
    case 7:
    case 8:
    case 9:
      dominantBaseline = 'text-after-edge'
      break
  }
  switch (n % 3) {
    case 2:
      textAnchor = 'middle'
      break
    case 3:
      textAnchor = 'end'
      break
  }
  return { dominantBaseline, textAnchor }
}

const MTEXT_contents = (contents: readonly DxfMTextContentElement[], i = 0): string => {
  if (contents.length <= i) {
    return ''
  }
  const restContents = MTEXT_contents(contents, i + 1)
  const content = contents[i]
  if (typeof content === 'string') {
    return content + restContents
  }
  if (Array.isArray(content)) {
    return MTEXT_contents(content) + restContents
  }
  if (content.S) {
    return (
      <tspan>
        <tspan dy='-.5em'>{content.S[0]}</tspan>
        <tspan dy='.5em'>{content.S[2]}</tspan>
      </tspan>
    ) + restContents
  }
  if (content.f) {
    return (
      <tspan
        font-family={content.f}
        font-weight={content.b && 'bold'}
        font-style={content.i && 'italic'}
      >
        {restContents}
      </tspan>
    )
  }
  if (content.Q) {
    return <tspan font-style={`oblique ${content.Q}deg`}>{restContents}</tspan>
  }
  return restContents
}

const createEntitySvgMap: (dxf: DxfReadonly, options: CreateSvgContentStringOptions) => Record<string, undefined | ((entity: DxfRecordReadonly, vertices: readonly DxfRecordReadonly[]) => string | undefined)> = (dxf, options) => {
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
      const strokeDasharray = _strokeDasharray.length % 2 === 1 ? _strokeDasharray : _strokeDasharray[0] === '0' ? _strokeDasharray.slice(1) : _strokeDasharray.concat('0')
      ltypeMap[$(ltype, 2)!] = { strokeDasharray: strokeDasharray.join(' ') }
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
    POINT: () => '',
    LINE: entity =>
      <line
        x1={$trim(entity, 10)}
        y1={$negate(entity, 20)}
        x2={$trim(entity, 11)}
        y2={$negate(entity, 21)}
        stroke={color(entity)}
        stroke-dasharray={strokeDasharray(entity)}
        style={extrusionStyle(entity)}
      />,
    POLYLINE: (entity, vertices) => {
      const flags = +($(entity, 70) ?? 0)
      let d = ''
      for (const vertex of vertices) {
        d += `${d ? 'L' : 'M'}${$trim(vertex, 10)} ${$negate(vertex, 20)}`
      }
      if (flags & 1) {
        d += 'Z'
      }
      return (
        <path
          d={d}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />
      )
    },
    LWPOLYLINE: entity => {
      const flags = +($(entity, 70) ?? 0)
      const xs = $$(entity, 10)
      const ys = $$(entity, 20)
      let d = ''
      for (let i = 0; i < xs.length; i++) {
        d += `${d ? 'L' : 'M'}${trim(xs[i])} ${negate(trim(ys[i]))}`
      }
      if (flags & 1) {
        d += 'Z'
      }
      return (
        <path
          d={d}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />
      )
    },
    CIRCLE: entity =>
      <circle
        cx={$trim(entity, 10)}
        cy={$negate(entity, 20)}
        r={$trim(entity, 40)}
        stroke={color(entity)}
        stroke-dasharray={strokeDasharray(entity)}
        style={extrusionStyle(entity)}
    />,
    ARC: entity => {
      const cx = $number(entity, 10)
      const cy = $number(entity, 20)
      const r = $number(entity, 40)
      const deg1 = $number(entity, 50, 0)
      const deg2 = $number(entity, 51, 0)
      const rad1 = deg1 * Math.PI / 180
      const rad2 = deg2 * Math.PI / 180
      const x1 = cx + r * Math.cos(rad1)
      const y1 = cy + r * Math.sin(rad1)
      const x2 = cx + r * Math.cos(rad2)
      const y2 = cy + r * Math.sin(rad2)
      const large = (deg2 - deg1 + 360) % 360 <= 180 ? '0' : '1'
      return (
        <path
          d={`M${x1} ${-y1}A${r} ${r} 0 ${large} 0 ${x2} ${-y2}`}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        />
      )
    },
    ELLIPSE: entity => {
      // https://wiki.gz-labs.net/index.php/ELLIPSE
      const cx = $number(entity, 10)
      const cy = $number(entity, 20)!
      const majorX = $number(entity, 11)
      const majorY = $number(entity, 21)
      const majorR = Math.sqrt(majorX * majorX + majorY * majorY)
      const minorR = $number(entity, 40)! * majorR
      const radAngleOffset = -Math.atan2(majorY, majorX)
      const rad1 = $number(entity, 41, 0)
      const rad2 = $number(entity, 42, 2 * Math.PI)
      if (nearlyEqual(rad1, 0) && nearlyEqual(rad2, 2 * Math.PI)) {
        return (
          <ellipse
            cx={cx}
            cy={-cy}
            rx={majorR}
            ry={minorR}
            stroke={color(entity)}
            stroke-dasharray={strokeDasharray(entity)}
            transform={radAngleOffset && `rotate(${radAngleOffset * 180 / Math.PI} ${cx} ${-cy})`}
            style={extrusionStyle(entity)}
          />
        )
      } else {
        warn('Elliptical arc cannot be rendered yet.')
        return ''
      }
    },
    LEADER: entity => {
      const xs = $$(entity, 10)
      const ys = $$(entity, 20)
      let d = ''
      for (let i = 0; i < xs.length; i++) {
        d += `${d ? 'L' : 'M'}${trim(xs[i])} ${negate(trim(ys[i]))}`
      }
      return (
        <path
          d={d}
          stroke={color(entity)}
          stroke-dasharray={strokeDasharray(entity)}
        />
      )
    },
    HATCH: entity => {
      const paths = entity.slice(
        entity.findIndex(groupCode => groupCode[0] === 92),
        entity.findIndex(groupCode => groupCode[0] === 97),
      )
      const x1s = $$(paths, 10).map(trim)
      const y1s = $$(paths, 20).map(trim).map(negate)
      const x2s = $$(paths, 11).map(trim)
      const y2s = $$(paths, 21).map(trim).map(negate)
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
      return <path fill={color(entity) || 'currentColor'} fill-opacity='.3' d={d} />
    },
    SOLID: entity => {
      const x1 = $trim(entity, 10)
      const y1 = $negate(entity, 20)
      const x2 = $trim(entity, 11)
      const y2 = $negate(entity, 21)
      const x3 = $trim(entity, 12)
      const y3 = $negate(entity, 22)
      const x4 = $trim(entity, 13)
      const y4 = $negate(entity, 23)
      const d = `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}${x3 !== x4 || y3 !== y4 ? `L${x4} ${y4}` : ''}Z`
      return <path d={d} fill={color(entity)} />
    },
    TEXT: entity => {
      const x = $trim(entity, 10)
      const y = $negate(entity, 20)
      const angle = $negate(entity, 50)
      const contents = parseDxfTextContent($(entity, 1) || '')
      return (
        <text
          x={x}
          y={y}
          font-size={$trim(entity, 40)}
          fill={color(entity)}
          dominant-baseline={TEXT_dominantBaseline[$trim(entity, 72) as string & number]}
          text-anchor={TEXT_textAnchor[$trim(entity, 73) as string & number]}
          transform={angle && `rotate(${angle} ${x} ${y})`}
          text-decoration={contents.length === 1 && textDecorations(contents[0])}
        >
          {
            contents.length === 1
              ? contents[0].text
              : contents.map(content => <tspan text-decoration={textDecorations(content)}>{content.text}</tspan>)
          }
        </text>
      )
    },
    MTEXT: entity => {
      const { dominantBaseline, textAnchor } = MTEXT_attachmentPoint($trim(entity, 71))
      return (
        <text
          fill={color(entity)}
          x={$trim(entity, 10)}
          y={$negate(entity, 20)}
          font-size={$trim(entity, 40)}
          dominant-baseline={dominantBaseline}
          text-anchor={textAnchor}
        >
          {MTEXT_contents(parseDxfMTextContent($$(entity, 3).join('') + ($(entity, 1) ?? '')))}
        </text>
      )
    },
    DIMENSION: entity => {
      const styleName = $(entity, 3)
      const style = dxf.TABLES?.DIMSTYLE?.find(style => $(style, 2) === styleName)
      let lineElements = ''
      let value = $number(entity, 42, 0)
      switch ($number(entity, 70, 0) & 7) {
        case 0: // Rotated, Horizontal, or Vertical
        case 1: // Aligned
        {
          const x1 = $trim(entity, 13)
          const y1 = $negate(entity, 23)
          const x3 = $trim(entity, 10)
          const y3 = $negate(entity, 20)
          const x4 = $trim(entity, 14)
          const y4 = $negate(entity, 24)
          const [x2, y2] = x3 === x4 ? [x1, y3] : [x3, y1]
          value = value || (Math.abs(x3 === x4 ? +y3! - +y1! : +x3! - +x1!) * $number(style, 144, 1))
          lineElements = <path d={`M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}L${x4} ${y4}`} />
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
          warn('Ordinate dimension cannot be rendered yet.', entity)
          break
      }
      value = round(value, +$(style, 271)! || +$(dxf.HEADER?.$DIMDEC, 70)! || 4)
      let textElement: string
      {
        const x = $trim(entity, 11)
        const y = $negate(entity, 21)
        const h = (+$(style, 140)! || +$(dxf.HEADER?.$DIMTXT, 40)!) * (+$(style, 40)! || +$(dxf.HEADER?.$DIMSCALE, 40)! || 1)
        const angle = $negate(entity, 50)
        const text = $(entity, 1)?.replace(/<>/, value as string & number) ?? String(value)
        textElement =
          <text
            x={x}
            y={y}
            font-size={h}
            fill={color(entity)}
            dominant-baseline='text-after-edge'
            text-anchor='middle'
            transform={angle && `rotate(${angle} ${x} ${y})`}
          >
            {MTEXT_contents(parseDxfMTextContent(text))}
          </text>
      }
      return (
        <g
          stroke={color(entity) || 'currentColor'}
          stroke-dasharray={strokeDasharray(entity)}
          style={extrusionStyle(entity)}
        >
          {lineElements + textElement}
        </g>
      )
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
      const lineColor = color(entity) || 'currentColor'
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
            <text
              x={x}
              y={y}
              fill={!isNaN(color) ? resolveColorIndex(color) : textColor}
            >
              {MTEXT_contents(parseDxfMTextContent($(cell, 1) ?? ''))}
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
      return (
        <g
          font-size={$trim(entity, 140)}
          dominant-baseline='text-before-edge'
          transform={`translate(${$trim(entity, 10)},${$negate(entity, 20)})`}
        >
          {s}
        </g>
      )
    },
    INSERT: entity => {
      const x = $trim(entity, 10)
      const y = $negate(entity, 20)
      const rotate = $negate(entity, 50)
      const xscale = $trim(entity, 41) || 1
      const yscale = $trim(entity, 42) || 1
      const transform = [
        +x! || +y! ? `translate(${x},${y})` : '',
        +xscale !== 1 || +yscale !== 1 ? `scale(${xscale},${yscale})` : '',
        rotate ? `rotate(${rotate})` : ''
      ].filter(Boolean).join(' ')
      const _block = dxf.BLOCKS?.[$(entity, 2)!]
      const block = _block?.slice(
        $(_block[0], 0) === 'BLOCK' ? 1 : 0,
        $(_block[_block.length - 1], 0) === 'ENDBLK' ? -1 : undefined,
      )
      const contents = entitiesToSvgString(dxf, block, options)
      return <g color={_color(entity)} transform={transform}>{contents}</g>
    },
  }
}

const entitiesToSvgString = (dxf: DxfReadonly, entities: DxfReadonly['ENTITIES'], options: CreateSvgContentStringOptions) => {
  const { warn } = options
  const entitySvgMap = createEntitySvgMap(dxf, options)
  let s = ''
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
      const entitySvg = entitySvgMap[entityType]
      if (entitySvg) {
        s += entitySvg(entity, vertices)
      } else {
        warn(`Unknown entity type: ${entityType}`, entity)
      }
    }
  }
  return s
}

export const createSvgContentsString = (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions>) => {
  const resolvedOptions = options ? { ...defaultOptions, ...options } : defaultOptions
  return entitiesToSvgString(dxf, dxf.ENTITIES, resolvedOptions)
}
