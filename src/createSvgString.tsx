import { DxfReadonly } from '@dxfom/dxf'
import { calculateViewBox } from './calculateViewBox'
import { createSvgContentsString, CreateSvgContentStringOptions } from './createSvgContentsString'

export const createSvgString = (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions>) => {
  const { x, y, w, h } = calculateViewBox(dxf)
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${x} ${y} ${w} ${h}`}
      width={w}
      height={h}
    >
      {createSvgContentsString(dxf, options)}
    </svg>
  )
}
