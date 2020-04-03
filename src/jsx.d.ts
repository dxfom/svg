type JSXElement<T extends string> = { readonly [K in T]?: string | number }

declare namespace JSX {
  type Element = string

  interface IntrinsicElements {
    svg: JSXElement<'xmlns' | 'viewBox'>
    g: JSXElement<'color' | 'stroke' | 'transform'>
    path: JSXElement<'d' | 'stroke' | 'fill' | 'transform'>
    line: JSXElement<'x1' | 'y1' | 'x2' | 'y2' | 'stroke' | 'transform'>
    circle: JSXElement<'cx' | 'cy' | 'r' | 'stroke' | 'transform'>
    ellipse: JSXElement<'cx' | 'cy' | 'rx' | 'ry' | 'stroke' | 'transform'>
    text: JSXElement<'x' | 'y' | 'fill' | 'transform'>
    tspan: JSXElement<'dx' | 'dy'>
  }
}
