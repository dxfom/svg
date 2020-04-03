const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const jsx = (type: string, props: Record<string, unknown>) => {
  let s = '<' + type
  let children: string | undefined
  for (const [key, value] of Object.entries(props)) {
    if (!value) {
      continue
    }
    if (key === 'children') {
      children = value as string
    } else {
      s += ` ${key}="${typeof value === 'string' ? escapeHtml(value) : value}"`
    }
  }
  if (type === 'line' || type === 'circle' || type === 'path') {
    if (!props.fill) {
      s += ' fill="none"'
    }
    s += ' vector-effect="non-scaling-stroke"'
  }
  if (type === 'text') {
    s += ' stroke="none" white-space="pre"'
  }
  if (children) {
    s += `>${Array.isArray(children) ? children.join('') : children}</${type}>`
  } else {
    s += '/>'
  }
  return s
}

export const jsxs = jsx
