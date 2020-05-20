import { DxfReadonly, getGroupCodeValue as $ } from '@dxfom/dxf'

const isNotNaN = (n: number) => !isNaN(n)

export const calculateViewBox = ({ ENTITIES }: DxfReadonly) => {
  if (!ENTITIES) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const entity of ENTITIES) {
    const xs = [+$(entity, 10)!, +$(entity, 11)!, +$(entity, 12)!].filter(isNotNaN)
    const ys = [-$(entity, 20)!, -$(entity, 21)!, -$(entity, 22)!].filter(isNotNaN)
    minX = Math.min(minX, ...xs)
    maxX = Math.max(maxX, ...xs)
    minY = Math.min(minY, ...ys)
    maxY = Math.max(maxY, ...ys)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

