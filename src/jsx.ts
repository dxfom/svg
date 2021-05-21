export type JSXElement<T extends string> = { readonly [K in T]?: string | number }

declare global {
  namespace JSX {
    type Element = string

    interface IntrinsicElements {
      svg: JSXElement<'xmlns' | 'viewBox' | 'width' | 'height'>
      g: JSXElement<'color' | 'stroke' | 'transform' | 'style'>
      path: JSXElement<'d' | 'stroke' | 'fill' | 'style'>
      line: JSXElement<'x1' | 'y1' | 'x2' | 'y2' | 'stroke' | 'style' | 'transform'>
      polyline: JSXElement<'points' | 'stroke' | 'style'>
      polygon: JSXElement<'points' | 'stroke' | 'style'>
      rect: JSXElement<'x' | 'y' | 'width' | 'height' | 'fill' | 'transform'>
      circle: JSXElement<'cx' | 'cy' | 'r' | 'stroke' | 'transform' | 'style'>
      ellipse: JSXElement<'cx' | 'cy' | 'rx' | 'ry' | 'stroke' | 'transform' | 'style'>
      text: JSXElement<'x' | 'y' | 'fill' | 'transform'>
      tspan: JSXElement<'dx' | 'dy'>
      defs: JSXElement<never>
      pattern: JSXElement<'id' | 'x' | 'y' | 'width' | 'height' | 'patternUnits' | 'patternTransform'>
      linearGradient: JSXElement<'id' | 'x1' | 'y1' | 'x2' | 'y2' | 'gradientUnits' | 'gradientTransform'>
      radialGradient: JSXElement<'id' | 'cx' | 'cy' | 'r' | 'gradientUnits' | 'gradientTransform'>
      stop: JSXElement<'offset' | 'stop-color'>
    }
  }
}
