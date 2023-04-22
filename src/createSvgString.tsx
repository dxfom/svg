import { DxfReadonly } from '@dxfom/dxf'
import { createSvgContents, CreateSvgContentStringOptions } from './createSvgContents'

export const createSvgString = (dxf: DxfReadonly, options?: Partial<CreateSvgContentStringOptions>) => {
  const [s, { x, y, w, h }] = createSvgContents(dxf, options)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${x} ${y} ${w} ${h}`} width={w} height={h} stroke-width="0.5">
      {s}
    </svg>
  )
}
