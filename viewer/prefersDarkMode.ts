import { DXF_COLOR_HSL } from '@dxfom/color/hsl'
import { Dxf, getGroupCodeValue as $ } from '@dxfom/dxf'

export const prefersDarkBackground = (dxf: Dxf) => {
  const lightnessSet = new Set<number>()
  for (const layer of dxf.TABLES?.LAYER ?? []) {
    const hsl = $(layer, 0) === 'LAYER' && DXF_COLOR_HSL[+$(layer, 62)!]
    hsl && lightnessSet.add(hsl[2])
  }
  for (const entity of dxf.ENTITIES ?? []) {
    const hsl = DXF_COLOR_HSL[+$(entity, 62)!]
    hsl && lightnessSet.add(hsl[2])
  }
  return lightnessSet.size !== 0 && [...lightnessSet].reduce((x, y) => x + y, 0) / lightnessSet.size > 50
}
