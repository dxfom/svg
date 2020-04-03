import fs from 'fs'
import path from 'path'
import { parseDxfFileString } from '@dxfom/dxf'
import { createSvgString } from '..'

if (!process.argv[2].endsWith('.dxf')) {
  console.error(`"${process.argv[2]}" seems not to be a DXF file.`)
  process.exit(1)
}

const dxf = parseDxfFileString(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
const svg = createSvgString(dxf, { warn: message => console.warn(message) })
fs.writeFileSync(path.resolve(process.argv[2]).replace(/\.dxf$/, '.svg'), svg, 'utf8')
