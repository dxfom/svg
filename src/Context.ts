import { getGroupCodeValue as $, getGroupCodeValues as $$, DxfReadonly, DxfRecordReadonly } from '@dxfom/dxf'
import { $number, $trim, resolveStrokeDasharray, round } from './util'

export interface ContextOptions {
  readonly resolveColorIndex: (colorIndex: number) => string
  readonly resolveLineWeight: (lineWeight: number) => number
}

export class Context {
  private readonly layerMap = new Map<
    string,
    undefined | Readonly<{ color: string; ltype: string | undefined; strokeWidth: number | undefined }>
  >()
  private readonly ltypeMap = new Map<string, undefined | { strokeDasharray: string }>()

  readonly resolveColorIndex
  readonly resolveLineWeight
  readonly $LUPREC

  constructor(readonly dxf: DxfReadonly, options: ContextOptions) {
    this.resolveColorIndex = options.resolveColorIndex
    this.resolveLineWeight = options.resolveLineWeight
    this.$LUPREC = +$(dxf.HEADER?.$LUPREC, 70)! || 4

    for (const layer of dxf.TABLES?.LAYER ?? []) {
      if ($(layer, 0) !== 'LAYER') {
        continue
      }
      const strokeWidth = $number(layer, 370)
      this.layerMap.set($(layer, 2)!, {
        color: options.resolveColorIndex(+$(layer, 62)!),
        ltype: $(layer, 6),
        strokeWidth: isNaN(strokeWidth) || strokeWidth < 0 ? undefined : strokeWidth,
      })
    }

    for (const ltype of dxf.TABLES?.LTYPE ?? []) {
      if ($(ltype, 0) !== 'LTYPE') {
        continue
      }
      const strokeDasharray = resolveStrokeDasharray($$(ltype, 49).map(s => round(s, 8)))
      strokeDasharray.length !== 0 && this.ltypeMap.set($(ltype, 2)!, { strokeDasharray: strokeDasharray.join(' ') })
    }
  }

  layer(entity: DxfRecordReadonly) {
    const layerId = $trim(entity, 8)
    return layerId ? this.layerMap.get(layerId) : undefined
  }

  ltype(entity: DxfRecordReadonly) {
    const ltypeId = $trim(entity, 6) ?? this.layer(entity)?.ltype
    return ltypeId ? this.ltypeMap.get(ltypeId) : undefined
  }

  _color(entity: DxfRecordReadonly) {
    const colorIndex = $trim(entity, 62)
    if (colorIndex === '0') {
      return 'currentColor'
    }
    if (colorIndex && colorIndex !== '256') {
      return this.resolveColorIndex(+colorIndex)
    }
    const layer = this.layer(entity)
    if (layer) {
      return layer.color
    }
  }

  color(entity: DxfRecordReadonly) {
    return this._color(entity) || 'currentColor'
  }

  strokeWidth(entity: DxfRecordReadonly) {
    const value = $trim(entity, 370)!
    switch (value) {
      case '-3':
        return this.resolveLineWeight(-3)
      case '-2':
        return this.resolveLineWeight(this.layer(entity)?.strokeWidth ?? -3)
      case '-1':
        return
      default:
        return this.resolveLineWeight(+value / 100)
    }
  }

  strokeDasharray(entity: DxfRecordReadonly) {
    return this.ltype(entity)?.strokeDasharray
  }

  roundCoordinate(n: number | string | undefined) {
    return n === undefined ? NaN : round(n, this.$LUPREC)
  }
}
