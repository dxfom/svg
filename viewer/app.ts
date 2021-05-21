import { parseDxfFileArrayBuffer } from '@dxfom/dxf'
import { createSvgString } from '..'
import { onDragDrop } from './onDragDrop'

const textDecoder = new TextDecoder('ms932')
const handleFile = async (file: File) =>
  (document.body.innerHTML = createSvgString(parseDxfFileArrayBuffer(await file.arrayBuffer()), { encoding: textDecoder }))

const input = document.body.appendChild(document.createElement('input'))
input.type = 'file'
input.accept = '.dxf'
input.onchange = async event => {
  const file = (event.target as HTMLInputElement).files[0]
  file && handleFile(file)
}

onDragDrop(document.body, handleFile)
