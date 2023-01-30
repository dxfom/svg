import { parseDxfFileArrayBuffer } from '@dxfom/dxf'
import { createSvgString } from '..'
import { onDragDrop } from './onDragDrop'

const textDecoder = new TextDecoder('ms932')
const handleFile = async (file: File) => {
  document.body.getElementsByTagName('main')[0].innerHTML = createSvgString(parseDxfFileArrayBuffer(await file.arrayBuffer()), {
    encoding: textDecoder,
    addAttributes: entity => Object.fromEntries(entity.map(([groupCode, value]) => [`data-${groupCode}`, value])),
  })
}

addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0]
  file && handleFile(file)
})

onDragDrop(document.body, handleFile)
