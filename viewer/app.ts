import { parseDxfFileArrayBuffer } from '@dxfom/dxf'
import { CreateSvgContentStringOptions, createSvgString } from '..'
import { onDragDrop } from './onDragDrop'
import { prefersDarkBackground } from './prefersDarkMode'

addEventListener('error', error => {
  console.error('error event:', error)
  alert(`error: ${error.message}`)
})
addEventListener('unhandledrejection', event => {
  console.error('unhandledrejection', event, event.promise, event.reason)
  alert(`unhandledrejection: ${event.reason}`)
})

declare global {
  interface FileSystemHandle {
    queryPermission(fileSystemHandlePermissionDescriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
    requestPermission(fileSystemHandlePermissionDescriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  }

  interface FileSystemDirectoryHandle {
    keys(): AsyncIterable<string>
    values(): AsyncIterable<FileSystemFileHandle>
    entries(): AsyncIterable<[string, FileSystemFileHandle]>
  }

  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>
  }

  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | Uint8Array | ArrayBuffer | DataView | Blob): Promise<void>
  }
}

const dxfdir$ = navigator.storage.getDirectory().then(root => root.getDirectoryHandle('dxf', { create: true }))

const initFileHistory = async () => {
  const list = document.getElementsByClassName('history')[0]
  const dir = await dxfdir$
  list.innerHTML = ''
  for await (const [name, handle] of dir.entries()) {
    const item = list.appendChild(document.createElement('li'))
    const deleteButton = item.appendChild(document.createElement('button'))
    const span = item.appendChild(document.createElement('span'))
    deleteButton.textContent = '×'
    deleteButton.addEventListener('click', async () => {
      await dir.removeEntry(name)
      await initFileHistory()
    })
    span.textContent = name
    span.addEventListener('click', async () => {
      await handle.queryPermission({ mode: 'read' })
      await handleFile(await handle.getFile())
      await initFileHistory()
    })
  }
}

const saveFileHistory = async (file: File) => {
  const dir = await dxfdir$
  const fileHandle = await dir.getFileHandle(file.name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(file)
  await writable.close()
  await initFileHistory()
}

const createSvgOptions: Partial<CreateSvgContentStringOptions> = {
  encoding: new TextDecoder('ms932'),
  addAttributes: entity => Object.fromEntries(entity.map(([groupCode, value]) => [`data-${groupCode}`, value])),
}
const handleFile = async (file: File) => {
  const buffer = await file.arrayBuffer()
  const dxf = parseDxfFileArrayBuffer(buffer)
  document.body.getElementsByTagName('main')[0].innerHTML = createSvgString(dxf, createSvgOptions)
  document.body.classList.toggle('dark', prefersDarkBackground(dxf))
  await saveFileHistory(file)
}

addEventListener('change', event => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  file && handleFile(file)
  input.value = ''
})

onDragDrop(document.body, handleFile)

initFileHistory()
