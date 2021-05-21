import { DXF_COLOR_HEX } from '@dxfom/color/hex';
import { getGroupCodeValue, getGroupCodeValues } from '@dxfom/dxf';
import { parseDxfMTextContent } from '@dxfom/mtext';
import { parseDxfTextContent } from '@dxfom/text';

const smallNumber = 1 / 64;
const nearlyEqual = (a, b) => Math.abs(a - b) < smallNumber;
const round$1 = (() => {
  const _shift = (n, precision) => {
    const [d, e] = String(n).split('e');
    return +(d + 'e' + (e ? +e + precision : precision));
  };

  return (n, precision) => _shift(Math.round(_shift(n, precision)), -precision);
})();
const trim = s => s ? s.trim() : s;
const $trim = (record, groupCode) => trim(getGroupCodeValue(record, groupCode));
const $number = (record, groupCode, defaultValue) => {
  const value = +getGroupCodeValue(record, groupCode);

  if (isNaN(value)) {
    return defaultValue === undefined ? NaN : defaultValue;
  }

  if (Math.abs(value) > 1e6) {
    throw Error(`group code ${groupCode} is invalid (${value})`);
  }

  const rounded = Math.round(value);
  return Math.abs(rounded - value) < 1e-8 ? rounded : value;
};
const translate = (x, y) => x || y ? `translate(${x || 0},${y || 0})` : '';
const rotate = (angle, x, y) => !angle || Math.abs(angle) < 0.01 ? '' : x || y ? `rotate(${angle},${x || 0},${y || 0})` : `rotate(${angle})`;
const transforms = (...s) => s.filter(Boolean).join(' ');
const resolveStrokeDasharray = lengths => {
  const dasharray = lengths.map(Math.abs);
  lengths[0] < 0 && dasharray.unshift(0);
  dasharray.length % 2 === 1 && dasharray.push(0);
  return dasharray;
};

class Context {
  layerMap = new Map();
  ltypeMap = new Map();

  constructor(dxf, options) {
    this.dxf = dxf;
    this.resolveColorIndex = options.resolveColorIndex;
    this.resolveLineWeight = options.resolveLineWeight;
    this.$LUPREC = +getGroupCodeValue(dxf.HEADER?.$LUPREC, 70) || 4;

    for (const layer of dxf.TABLES?.LAYER ?? []) {
      if (getGroupCodeValue(layer, 0) !== 'LAYER') {
        continue;
      }

      const strokeWidth = $number(layer, 370);
      this.layerMap.set(getGroupCodeValue(layer, 2), {
        color: options.resolveColorIndex(+getGroupCodeValue(layer, 62)),
        ltype: getGroupCodeValue(layer, 6),
        strokeWidth: isNaN(strokeWidth) ? undefined : strokeWidth
      });
    }

    for (const ltype of dxf.TABLES?.LTYPE ?? []) {
      if (getGroupCodeValue(ltype, 0) === 'LTYPE') {
        continue;
      }

      const strokeDasharray = resolveStrokeDasharray(getGroupCodeValues(ltype, 49).map(s => round$1(s, 8)));
      strokeDasharray.length !== 0 && this.ltypeMap.set(getGroupCodeValue(ltype, 2), {
        strokeDasharray: strokeDasharray.join(' ')
      });
    }
  }

  layer(entity) {
    const layerId = $trim(entity, 8);
    return layerId ? this.layerMap.get(layerId) : undefined;
  }

  ltype(entity) {
    const ltypeId = $trim(entity, 8) ?? this.layer(entity)?.ltype;
    return ltypeId ? this.ltypeMap.get(ltypeId) : undefined;
  }

  _color(entity) {
    const colorIndex = $trim(entity, 62);

    if (colorIndex === '0') {
      return 'currentColor';
    }

    if (colorIndex && colorIndex !== '256') {
      return this.resolveColorIndex(+colorIndex);
    }

    const layer = this.layer(entity);

    if (layer) {
      return layer.color;
    }
  }

  color(entity) {
    return this._color(entity) || 'currentColor';
  }

  strokeWidth(entity) {
    const value = $trim(entity, 370);

    switch (value) {
      case '-3':
        return this.resolveLineWeight(-3);

      case '-2':
        return this.resolveLineWeight(this.layer(entity)?.strokeWidth ?? -3);

      case '-1':
        return;

      default:
        return this.resolveLineWeight(+value / 100);
    }
  }

  strokeDasharray(entity) {
    return this.ltype(entity)?.strokeDasharray;
  }

  roundCoordinate(n) {
    return n === undefined ? NaN : round$1(n, this.$LUPREC);
  }

}

const DimStyles = {
  DIMSCALE: [40, 40, 1],
  DIMTP: [47, 40, NaN],
  DIMTM: [48, 40, NaN],
  DIMTOL: [71, 70, 0],
  DIMTXT: [140, 40, 1],
  DIMLFAC: [144, 40, 1],
  DIMCLRT: [178, 70, NaN],
  DIMDEC: [271, 70, 4]
};

const collectDimensionStyleOverrides = d => {
  const result = new Map();

  for (let i = 0; i < d.length; i++) {
    if (d[i][0] === 1000 && d[i][1].trim() === 'DSTYLE' && d[i + 1][0] === 1002 && d[i + 1][1].trim() === '{') {
      for (let j = i + 2; j < d.length; j++) {
        if (d[j][0] === 1002) {
          break;
        }

        if (d[j][0] === 1070) {
          result.set(+d[j][1], d[++j][1]);
        }
      }

      return result;
    }
  }
};

const collectDimensionStyles = (dxf, dimension) => {
  const styleName = getGroupCodeValue(dimension, 3);
  const style = dxf.TABLES?.DIMSTYLE?.find(style => getGroupCodeValue(style, 2) === styleName);
  const styleOverrides = collectDimensionStyleOverrides(dimension);
  const styles = Object.create(null);

  for (const [variableName, [groupCode, headerGroupCode, defaultValue]] of Object.entries(DimStyles)) {
    const value = styleOverrides?.get(groupCode) ?? getGroupCodeValue(style, groupCode) ?? getGroupCodeValue(dxf.HEADER?.['$' + variableName], headerGroupCode);
    styles[variableName] = value !== undefined ? +value : defaultValue;
  }

  return styles;
};

const toleranceString = n => n > 0 ? '+' + n : n < 0 ? String(n) : ' 0';

const dimensionValueToMText = (measurement, dimension, styles) => {
  const savedValue = $number(dimension, 42, -1);
  const value = round$1(savedValue !== -1 ? savedValue : measurement * styles.DIMLFAC, styles.DIMDEC);
  let valueWithTolerance = String(value);

  if (styles.DIMTOL) {
    const p = styles.DIMTP;
    const n = styles.DIMTM;

    if (p || n) {
      if (p === n) {
        valueWithTolerance = `${value}  ±${p}`;
      } else {
        valueWithTolerance = `${value}  {\\S${toleranceString(p)}^${toleranceString(-n)};}`;
      }
    }
  }

  const template = getGroupCodeValue(dimension, 1);
  return template ? template.replace(/<>/, valueWithTolerance) : valueWithTolerance;
};

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsx = (type, props) => {
  let s = '<' + type;
  let children;

  for (const [key, value] of Object.entries(props)) {
    if (!value && value !== 0) {
      continue;
    }

    if (key === 'children') {
      children = value;
    } else {
      s += ` ${key}="${typeof value === 'string' ? escapeHtml(value) : value}"`;
    }
  }

  if (type === 'line' || type === 'polyline' || type === 'polygon' || type === 'circle' || type === 'path') {
    if (!props.fill) {
      s += ' fill="none"';
    }

    s += ' vector-effect="non-scaling-stroke"';
  }

  if (type === 'text') {
    s += ' stroke="none" style="white-space:pre"';
  }

  if (children) {
    s += `>${Array.isArray(children) ? children.flat(Infinity).join('') : children}</${type}>`;
  } else {
    s += '/>';
  }

  return s;
};
const jsxs = jsx;

const round = n => round$1(n, 6);

const collectHatchPathElements = (hatch, context) => {
  const index = hatch.findIndex(groupCode => groupCode[0] === 91);

  if (index === -1) {
    return [];
  }

  const paths = [];
  let currentPath;

  for (let i = index + 1; hatch[i] && hatch[i][0] !== 98; i++) {
    const groupCode = hatch[i][0];

    switch (groupCode) {
      case 92:
        paths.push(currentPath = {
          10: [],
          20: []
        });
        break;

      case 10:
      case 20:
        currentPath?.[groupCode].push(context.roundCoordinate(hatch[i][1]));
        break;
    }
  }

  return paths;
};

const collectHatchPatternElements = hatch => {
  const index = hatch.findIndex(groupCode => groupCode[0] === 78);

  if (index === -1) {
    return [];
  }

  const patterns = [];
  let currentPattern;

  for (let i = index + 1; hatch[i]; i++) {
    const groupCode = hatch[i][0];
    const value = round(hatch[i][1]);

    switch (groupCode) {
      case 53:
        patterns.push(currentPattern = {
          53: value,
          43: 0,
          44: 0,
          45: 0,
          46: 0,
          49: []
        });
        break;

      case 43:
      case 44:
      case 45:
      case 46:
        currentPattern && (currentPattern[groupCode] = value);
        break;

      case 49:
        currentPattern?.[49].push(value);
        break;

      case 79:
        break;

      default:
        return patterns;
    }
  }

  return patterns;
};

const hatchGradientDefs = {
  LINEAR: (id, colors, hatch) => {
    const angle = round($number(hatch, 460) * 180 / Math.PI);
    return jsxs("linearGradient", {
      id: id,
      x2: "1",
      y2: "0",
      gradientTransform: rotate(-angle, 0.5, 0.5),
      children: [jsx("stop", {
        "stop-color": colors[0]
      }), jsx("stop", {
        "stop-color": colors[1],
        offset: "1"
      })]
    });
  },
  CYLINDER: (id, colors, hatch) => {
    const angle = round($number(hatch, 460) * 180 / Math.PI);
    return jsxs("linearGradient", {
      id: id,
      x2: "1",
      y2: "0",
      gradientTransform: rotate(-angle, 0.5, 0.5),
      children: [jsx("stop", {
        "stop-color": colors[0]
      }), jsx("stop", {
        "stop-color": colors[1],
        offset: ".5"
      }), jsx("stop", {
        "stop-color": colors[0],
        offset: "1"
      })]
    });
  },
  INVCYLINDER: (id, colors, hatch, paths) => hatchGradientDefs.CYLINDER(id, [colors[1], colors[0]], hatch, paths),
  SPHERICAL: (id, colors, _, paths) => {
    const xs = paths.flatMap(({
      10: x
    }) => x);
    const ys = paths.flatMap(({
      20: y
    }) => y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    return jsxs("radialGradient", {
      id: id,
      cx: (xMin + xMax) / 2,
      cy: -(yMin + yMax) / 2,
      r: Math.max(xMax - xMin, yMax - yMin) / 2,
      gradientUnits: "userSpaceOnUse",
      children: [jsx("stop", {
        "stop-color": colors[1]
      }), jsx("stop", {
        "stop-color": colors[0],
        offset: "1"
      })]
    });
  },
  INVSPHERICAL: (id, colors, hatch, paths) => hatchGradientDefs.SPHERICAL(id, [colors[1], colors[0]], hatch, paths),
  HEMISPHERICAL: (id, colors) => jsxs("radialGradient", {
    id: id,
    cy: "1",
    gradientTransform: "translate(-.75,-1.5) scale(2.5)",
    children: [jsx("stop", {
      "stop-color": colors[1]
    }), jsx("stop", {
      "stop-color": colors[0],
      offset: "1"
    })]
  }),
  INVHEMISPHERICAL: (id, colors, hatch, paths) => hatchGradientDefs.HEMISPHERICAL(id, [colors[1], colors[0]], hatch, paths),
  CURVED: (id, colors) => jsxs("radialGradient", {
    id: id,
    cy: "1",
    gradientTransform: "translate(-1,-2) scale(3)",
    children: [jsx("stop", {
      "stop-color": colors[1]
    }), jsx("stop", {
      "stop-color": colors[0],
      offset: "1"
    })]
  }),
  INVCURVED: (id, colors, hatch, paths) => hatchGradientDefs.CURVED(id, [colors[1], colors[0]], hatch, paths)
};
const hatchFill = (hatch, paths, context) => {
  const fillColor = context.color(hatch);

  if ($trim(hatch, 450) === '1') {
    // gradient
    const id = `hatch-gradient-${getGroupCodeValue(hatch, 5)}`;
    const colorIndices = getGroupCodeValues(hatch, 63);
    const colors = [context.resolveColorIndex(+colorIndices[0] || 5), context.resolveColorIndex(+colorIndices[1] || 2)];
    const gradientPatternName = $trim(hatch, 470);
    const defs = gradientPatternName && hatchGradientDefs[gradientPatternName]?.(id, colors, hatch, paths);
    return defs ? [`url(#${id})`, `<defs>${defs}</defs>`] : [fillColor, ''];
  } else if ($trim(hatch, 70) === '1') {
    // solid
    return [fillColor, ''];
  } else {
    // pattern
    const patternElements = collectHatchPatternElements(hatch);

    if (patternElements.length === 0) {
      return [fillColor, ''];
    }

    const handle = getGroupCodeValue(hatch, 5);
    const id = `hatch-pattern-${handle}`;
    const bgGroupCodeIndex = hatch.findIndex(([groupCode, value]) => groupCode === 1001 && value === 'HATCHBACKGROUNDCOLOR');
    const bgColorIndex = bgGroupCodeIndex !== -1 && +hatch[bgGroupCodeIndex + 1][1] & 255;
    const bgColor = bgColorIndex && context.resolveColorIndex(bgColorIndex);
    return [`url(#${id})`, jsxs("defs", {
      children: [patternElements.map(({
        53: angle,
        43: xBase,
        44: yBase,
        45: xOffset,
        46: yOffset,
        49: strokeDasharray
      }, i) => {
        strokeDasharray = resolveStrokeDasharray(strokeDasharray);
        const height = round(Math.hypot(xOffset, yOffset));
        const width = round(strokeDasharray.reduce((x, y) => x + y, 0)) || 256;
        const transform = transforms(translate(xBase, -yBase), rotate(-angle));
        return jsx("pattern", {
          id: `${id}-${i}`,
          width: width,
          height: height,
          patternUnits: "userSpaceOnUse",
          patternTransform: transform,
          children: jsx("line", {
            x2: width,
            "stroke-width": "1",
            stroke: fillColor,
            "stroke-dasharray": strokeDasharray.join(' ')
          })
        });
      }), jsxs("pattern", {
        id: id,
        width: 256,
        height: 256,
        patternUnits: "userSpaceOnUse",
        children: [bgColor ? jsx("rect", {
          fill: bgColor,
          width: 256,
          height: 256
        }) : '', patternElements.map((_, i) => jsx("rect", {
          fill: `url(#hatch-pattern-${handle}-${i})`,
          width: 256,
          height: 256
        }))]
      })]
    })];
  }
};

const MTEXT_attachmentPoint = n => {
  n = +n;
  let dominantBaseline;
  let textAnchor;

  switch (n) {
    case 1:
    case 2:
    case 3:
      dominantBaseline = 'text-before-edge';
      break;

    case 4:
    case 5:
    case 6:
      dominantBaseline = 'central';
      break;

    case 7:
    case 8:
    case 9:
      dominantBaseline = 'text-after-edge';
      break;
  }

  switch (n % 3) {
    case 2:
      textAnchor = 'middle';
      break;

    case 0:
      textAnchor = 'end';
      break;
  }

  return {
    dominantBaseline,
    textAnchor
  };
};

const yx2angle = (y, x) => round$1(Math.atan2(y || 0, x || 0) * 180 / Math.PI, 5) || 0;

const MTEXT_angle = mtext => {
  for (let i = mtext.length - 1; i >= 0; i--) {
    switch (mtext[i][0]) {
      case 50:
        return round$1(mtext[i][1], 5) || 0;

      case 11:
        return yx2angle($number(mtext, 12), +mtext[i][1]);

      case 21:
        return yx2angle(+mtext[i][1], $number(mtext, 11));
    }
  }

  return 0;
};
const MTEXT_contents = (contents, options, i = 0) => {
  if (contents.length <= i) {
    return '';
  }

  const restContents = MTEXT_contents(contents, options, i + 1);
  const content = contents[i];

  if (typeof content === 'string') {
    return content + restContents;
  }

  if (Array.isArray(content)) {
    return MTEXT_contents(content, options) + restContents;
  }

  if (content.S) {
    return jsxs("tspan", {
      children: [jsx("tspan", {
        dy: "-.5em",
        children: content.S[0]
      }), jsx("tspan", {
        dy: "1em",
        dx: content.S[0].length / -2 + 'em',
        children: content.S[2]
      })]
    }) + restContents;
  }

  if (content.f) {
    const _font = {
      family: content.f,
      weight: content.b ? 700 : 400,
      style: content.i ? 'italic' : undefined
    };

    const font = options?.resolveFont?.(_font) ?? _font;

    return jsx("tspan", {
      "font-family": font.family,
      "font-weight": font.weight,
      "font-style": font.style,
      "font-size": font.scale && font.scale !== 1 ? font.scale + 'em' : undefined,
      children: restContents
    });
  }

  if (content.Q) {
    return jsx("tspan", {
      "font-style": `oblique ${content.Q}deg`,
      children: restContents
    });
  }

  return restContents;
};

const defaultOptions = {
  warn: console.debug,
  resolveColorIndex: colorIndex => DXF_COLOR_HEX[colorIndex] ?? '#888',
  resolveLineWeight: lineWeight => lineWeight === -3 ? 0.5 : round$1(lineWeight * 10, 6)
};

const commonAttributes = entity => ({
  'data-5': $trim(entity, 5)
});

const normalizeVector3 = ([x, y, z]) => {
  const a = Math.hypot(x, y, z);
  return [x / a, y / a, z / a];
};

const crossProduct = ([a1, a2, a3], [b1, b2, b3]) => [a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1];

const extrusionStyle = entity => {
  const extrusionX = -$number(entity, 210, 0);
  const extrusionY = $number(entity, 220, 0);
  const extrusionZ = $number(entity, 230, 1);

  if (Math.abs(extrusionX) < 1 / 64 && Math.abs(extrusionY) < 1 / 64) {
    return extrusionZ < 0 ? 'transform:rotateY(180deg)' : undefined;
  }

  const az = normalizeVector3([extrusionX, extrusionY, extrusionZ]);
  const ax = normalizeVector3(crossProduct([0, 0, 1], az));
  const ay = normalizeVector3(crossProduct(az, ax));
  return `transform:matrix3d(${ax},0,${ay},0,0,0,0,0,0,0,0,1)`;
};

const TEXT_textDecorations = ({
  k,
  o,
  u
}) => {
  const decorations = [];
  k && decorations.push('line-through');
  o && decorations.push('overline');
  u && decorations.push('underline');
  return decorations.join(' ');
};

const TEXT_dominantBaseline = [, 'text-after-edge', 'central', 'text-before-edge'];
const TEXT_textAnchor = [, 'middle', 'end',, 'middle'];

const polylinePoints = (xs, ys) => {
  let points = '';

  for (let i = 0; i < xs.length; i++) {
    points += `${xs[i]},${ys[i]} `;
  }

  return points.slice(0, -1);
};

const createEntitySvgMap = (dxf, options) => {
  const {
    warn,
    resolveColorIndex
  } = options;
  const context = new Context(dxf, options);

  const roundCoordinate = n => context.roundCoordinate(n);

  const $roundCoordinate = (entity, groupCode) => roundCoordinate(getGroupCodeValue(entity, groupCode));

  const lineAttributes = entity => Object.assign(commonAttributes(entity), {
    stroke: context.color(entity),
    'stroke-width': context.strokeWidth(entity),
    'stroke-dasharray': context.strokeDasharray(entity),
    style: extrusionStyle(entity)
  });

  const entitySvgMap = {
    POINT: () => undefined,
    LINE: entity => {
      const x1 = $roundCoordinate(entity, 10);
      const x2 = $roundCoordinate(entity, 11);
      const y1 = -$roundCoordinate(entity, 20);
      const y2 = -$roundCoordinate(entity, 21);
      return [jsx("line", { ...lineAttributes(entity),
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2
      }), [x1, x2], [y1, y2]];
    },
    POLYLINE: (entity, vertices) => {
      const xs = vertices.map(v => $roundCoordinate(v, 10));
      const ys = vertices.map(v => -$roundCoordinate(v, 20));
      const flags = +(getGroupCodeValue(entity, 70) ?? 0);
      const attrs = Object.assign(lineAttributes(entity), {
        points: polylinePoints(xs, ys)
      });
      return [flags & 1 ? jsx("polygon", { ...attrs
      }) : jsx("polyline", { ...attrs
      }), xs, ys];
    },
    LWPOLYLINE: entity => {
      const xs = getGroupCodeValues(entity, 10).map(s => roundCoordinate(s));
      const ys = getGroupCodeValues(entity, 20).map(s => -roundCoordinate(s));
      const flags = +(getGroupCodeValue(entity, 70) ?? 0);
      const attrs = Object.assign(lineAttributes(entity), {
        points: polylinePoints(xs, ys)
      });
      return [flags & 1 ? jsx("polygon", { ...attrs
      }) : jsx("polyline", { ...attrs
      }), xs, ys];
    },
    CIRCLE: entity => {
      const cx = $roundCoordinate(entity, 10);
      const cy = -$roundCoordinate(entity, 20);
      const r = $roundCoordinate(entity, 40);
      return [jsx("circle", { ...lineAttributes(entity),
        cx: cx,
        cy: cy,
        r: r
      }), [cx - r, cx + r], [cy - r, cy + r]];
    },
    ARC: entity => {
      const cx = $roundCoordinate(entity, 10);
      const cy = $roundCoordinate(entity, 20);
      const r = $roundCoordinate(entity, 40);
      const deg1 = $number(entity, 50, 0);
      const deg2 = $number(entity, 51, 0);
      const rad1 = deg1 * Math.PI / 180;
      const rad2 = deg2 * Math.PI / 180;
      const x1 = roundCoordinate(cx + r * Math.cos(rad1));
      const y1 = roundCoordinate(cy + r * Math.sin(rad1));
      const x2 = roundCoordinate(cx + r * Math.cos(rad2));
      const y2 = roundCoordinate(cy + r * Math.sin(rad2));
      const large = (deg2 - deg1 + 360) % 360 <= 180 ? '0' : '1';
      return [jsx("path", { ...lineAttributes(entity),
        d: `M${x1} ${-y1}A${r} ${r} 0 ${large} 0 ${x2} ${-y2}`
      }), [x1, x2], [-y1, -y2]];
    },
    ELLIPSE: entity => {
      // https://wiki.gz-labs.net/index.php/ELLIPSE
      const rad1 = $number(entity, 41, 0);
      const rad2 = $number(entity, 42, 2 * Math.PI);

      if (nearlyEqual(rad1, 0) && nearlyEqual(rad2, 2 * Math.PI)) {
        const cx = $roundCoordinate(entity, 10);
        const cy = -$roundCoordinate(entity, 20);
        const majorX = $roundCoordinate(entity, 11);
        const majorY = $roundCoordinate(entity, 21);
        const majorR = Math.hypot(majorX, majorY);
        const minorR = $number(entity, 40) * majorR;
        const radAngleOffset = -Math.atan2(majorY, majorX);
        const transform = rotate(radAngleOffset * 180 / Math.PI, cx, cy);
        return [jsx("ellipse", { ...lineAttributes(entity),
          cx: cx,
          cy: cy,
          rx: majorR,
          ry: minorR,
          transform: transform
        }), [cx - majorR, cx + majorR], [cy - minorR, cy + minorR]];
      } else {
        warn('Elliptical arc cannot be rendered yet.');
      }
    },
    LEADER: entity => {
      const xs = getGroupCodeValues(entity, 10).map(s => roundCoordinate(s));
      const ys = getGroupCodeValues(entity, 20).map(s => -roundCoordinate(s));
      return [jsx("polyline", { ...commonAttributes(entity),
        points: polylinePoints(xs, ys),
        stroke: context.color(entity),
        "stroke-dasharray": context.strokeDasharray(entity)
      }), xs, ys];
    },
    HATCH: entity => {
      const paths = collectHatchPathElements(entity, context);
      let d = '';

      for (const {
        10: xs,
        20: ys
      } of paths) {
        d += `M${xs[0]} ${-ys[0]}`;

        for (let i = 1; i < xs.length; i++) {
          d += `L${xs[i]} ${-ys[i]}`;
        }
      }

      d += 'Z';
      const [fill, defs] = hatchFill(entity, paths, context);
      return [defs + jsx("path", { ...commonAttributes(entity),
        d: d,
        fill: fill
      }), paths.flatMap(path => path[10]), paths.flatMap(path => -path[20])];
    },
    SOLID: entity => {
      const x1 = $roundCoordinate(entity, 10);
      const x2 = $roundCoordinate(entity, 11);
      const x3 = $roundCoordinate(entity, 12);
      const x4 = $roundCoordinate(entity, 13);
      const y1 = -$roundCoordinate(entity, 20);
      const y2 = -$roundCoordinate(entity, 21);
      const y3 = -$roundCoordinate(entity, 22);
      const y4 = -$roundCoordinate(entity, 23);
      const d = `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}${x3 !== x4 || y3 !== y4 ? `L${x4} ${y4}` : ''}Z`;
      return [jsx("path", { ...commonAttributes(entity),
        d: d,
        fill: context.color(entity)
      }), [x1, x2, x3, x4], [y1, y2, y3, y4]];
    },
    TEXT: entity => {
      const x = $roundCoordinate(entity, 10);
      const y = -$roundCoordinate(entity, 20);
      const h = $roundCoordinate(entity, 40);
      const angle = -$number(entity, 50);
      const contents = parseDxfTextContent(getGroupCodeValue(entity, 1) || '', options);
      return [jsx("text", { ...commonAttributes(entity),
        x: x,
        y: y,
        fill: context.color(entity),
        "font-size": h,
        "dominant-baseline": TEXT_dominantBaseline[$trim(entity, 73)],
        "text-anchor": TEXT_textAnchor[$trim(entity, 72)],
        transform: rotate(angle, x, y),
        "text-decoration": contents.length === 1 && TEXT_textDecorations(contents[0]),
        children: contents.length === 1 ? contents[0].text : contents.map(content => jsx("tspan", {
          "text-decoration": TEXT_textDecorations(content),
          children: content.text
        }))
      }), [x, x + h * contents.length], [y, y + h]];
    },
    MTEXT: entity => {
      const x = $roundCoordinate(entity, 10);
      const y = -$roundCoordinate(entity, 20);
      const h = $roundCoordinate(entity, 40);
      const angle = MTEXT_angle(entity);
      const {
        dominantBaseline,
        textAnchor
      } = MTEXT_attachmentPoint($trim(entity, 71));
      const contents = getGroupCodeValues(entity, 3).join('') + (getGroupCodeValue(entity, 1) ?? '');
      return [jsx("text", { ...commonAttributes(entity),
        x: x,
        y: y,
        fill: context.color(entity),
        "font-size": h,
        "dominant-baseline": dominantBaseline,
        "text-anchor": textAnchor,
        transform: rotate(-angle, x, y),
        children: MTEXT_contents(parseDxfMTextContent(contents, options), options)
      }), [x, x + h * contents.length], [y, y + h]];
    },
    DIMENSION: entity => {
      const dimStyles = collectDimensionStyles(dxf, entity);
      let lineElements = '';
      let measurement;
      let dominantBaseline = 'text-after-edge';
      let textAnchor = 'middle';
      let angle;
      const tx = $roundCoordinate(entity, 11);
      const ty = -$roundCoordinate(entity, 21);
      const x0 = $roundCoordinate(entity, 10);
      const y0 = -$roundCoordinate(entity, 20);
      const xs = [tx];
      const ys = [ty];
      const dimensionType = $number(entity, 70, 0);

      switch (dimensionType & 7) {
        case 0: // Rotated, Horizontal, or Vertical

        case 1:
          {
            // Aligned
            const x3 = $roundCoordinate(entity, 13);
            const x4 = $roundCoordinate(entity, 14);
            const y3 = -$roundCoordinate(entity, 23);
            const y4 = -$roundCoordinate(entity, 24);
            angle = Math.round(-$number(entity, 50, 0) || 0);

            if (angle % 180 === 0) {
              measurement = Math.abs(x3 - x4);
              lineElements = jsx("path", {
                stroke: "currentColor",
                d: `M${x3} ${y3}L${x3} ${y0}L${x4} ${y0}L${x4} ${y4}`
              });
              angle = 0;
            } else {
              measurement = Math.abs(y3 - y4);
              lineElements = jsx("path", {
                stroke: "currentColor",
                d: `M${x3} ${y3}L${x0} ${y3}L${x0} ${y4}L${x4} ${y4}`
              });
            }

            xs.push(x3, x4);
            ys.push(y3, y4);
            break;
          }

        case 2: // Angular

        case 5:
          // Angular 3-point
          warn('Angular dimension cannot be rendered yet.', entity);
          return;

        case 3: // Diameter

        case 4:
          {
            // Radius
            const x5 = $roundCoordinate(entity, 15);
            const y5 = -$roundCoordinate(entity, 25);
            measurement = Math.hypot(x0 - x5, y0 - y5);
            lineElements = jsx("path", {
              stroke: "currentColor",
              d: `M${x5} ${y5}L${tx} ${ty}`
            });
            xs.push(x0, x5);
            ys.push(y0, y5);
            break;
          }

        case 6:
          {
            // Ordinate
            const x3 = $roundCoordinate(entity, 13);
            const x4 = $roundCoordinate(entity, 14);
            const y3 = -$roundCoordinate(entity, 23);
            const y4 = -$roundCoordinate(entity, 24);

            if (dimensionType & 64) {
              measurement = Math.abs(x0 - +x3);
              lineElements = jsx("path", {
                stroke: "currentColor",
                d: `M${x3} ${y3}L${x3} ${y4}L${x4} ${y4}L${tx} ${ty}`
              });
              angle = -90;
            } else {
              measurement = Math.abs(y0 - +y3);
              lineElements = jsx("path", {
                stroke: "currentColor",
                d: `M${x3} ${y3}L${x4} ${y3}L${x4} ${y4}L${tx} ${ty}`
              });
            }

            dominantBaseline = 'central';
            textAnchor = 'middle';
            xs.push(x3, x4);
            ys.push(y3, y4);
            break;
          }

        default:
          warn('Unknown dimension type.', entity);
          return;
      }

      let textElement;
      {
        const mtext = dimensionValueToMText(measurement, entity, dimStyles);
        const h = dimStyles.DIMTXT * dimStyles.DIMSCALE;
        const textColor = dimStyles.DIMCLRT;
        textElement = jsx("text", {
          x: tx,
          y: ty,
          fill: isNaN(textColor) ? context.color(entity) : textColor === 0 ? 'currentColor' : resolveColorIndex(textColor),
          "font-size": h,
          "dominant-baseline": dominantBaseline,
          "text-anchor": textAnchor,
          transform: rotate(angle, tx, ty),
          children: MTEXT_contents(parseDxfMTextContent(mtext, options), options)
        });
      }
      return [jsx("g", { ...commonAttributes(entity),
        color: context.color(entity),
        "stroke-width": context.strokeWidth(entity),
        "stroke-dasharray": context.strokeDasharray(entity),
        style: extrusionStyle(entity),
        children: lineElements + textElement
      }), xs, ys];
    },
    ACAD_TABLE: entity => {
      const cells = [];
      {
        let index = entity.findIndex(groupCode => groupCode[0] === 171);

        for (let i = index + 1; i < entity.length; i++) {
          if (entity[i][0] === 171) {
            cells.push(entity.slice(index, i));
            index = i;
          }
        }

        cells.push(entity.slice(index, entity.length));
      }
      const ys = getGroupCodeValues(entity, 141).map(s => +s).reduce((ys, size) => (ys.push(ys[ys.length - 1] + size), ys), [0]);
      const xs = getGroupCodeValues(entity, 142).map(s => +s).reduce((xs, size) => (xs.push(xs[xs.length - 1] + size), xs), [0]);
      const lineColor = context.color(entity);
      const textColor = resolveColorIndex(+getGroupCodeValue(entity, 64));
      let s = ys.map(y => jsx("line", {
        stroke: lineColor,
        x1: "0",
        y1: y,
        x2: xs[xs.length - 1],
        y2: y
      })).join('');
      let xi = 0;
      let yi = 0;

      for (const cell of cells) {
        const x = xs[xi];
        const y = ys[yi];
        const color = +getGroupCodeValue(cell, 64);

        if (!+getGroupCodeValue(cell, 173)) {
          s += jsx("line", {
            x1: x,
            y1: y,
            x2: x,
            y2: ys[yi + 1],
            stroke: lineColor
          });
        }

        if ($trim(cell, 171) === '2') {
          warn('Table cell type "block" cannot be rendered yet.', entity, cell);
        } else {
          s += jsx("text", {
            x: x,
            y: y,
            fill: !isNaN(color) ? resolveColorIndex(color) : textColor,
            children: MTEXT_contents(parseDxfMTextContent(getGroupCodeValue(cell, 1) ?? ''), options)
          });
        }

        if (++xi === xs.length - 1) {
          xi = 0;
          yi++;
        }
      }

      s += jsx("line", {
        x1: xs[xs.length - 1],
        y1: "0",
        x2: xs[xs.length - 1],
        y2: ys[ys.length - 1],
        stroke: lineColor
      });
      const x = $roundCoordinate(entity, 10);
      const y = -$roundCoordinate(entity, 20);
      return [jsx("g", { ...commonAttributes(entity),
        "font-size": $trim(entity, 140),
        "dominant-baseline": "text-before-edge",
        transform: translate(x, y),
        children: s
      }), xs.map(_x => _x + x), ys.map(_y => _y + y)];
    },
    INSERT: entity => {
      const x = $roundCoordinate(entity, 10);
      const y = -$roundCoordinate(entity, 20);
      const angle = -$number(entity, 50);
      const xscale = $number(entity, 41, 1) || 1;
      const yscale = $number(entity, 42, 1) || 1;
      const transform = transforms(translate(x, y), xscale !== 1 || yscale !== 1 ? `scale(${xscale},${yscale})` : '', rotate(angle));

      const _block = dxf.BLOCKS?.[getGroupCodeValue(entity, 2)];

      const block = _block?.slice(getGroupCodeValue(_block[0], 0) === 'BLOCK' ? 1 : 0, getGroupCodeValue(_block[_block.length - 1], 0) === 'ENDBLK' ? -1 : undefined);
      const [contents, bbox] = entitiesSvg(block, entitySvgMap, options);
      return [jsx("g", { ...lineAttributes(entity),
        color: context._color(entity),
        "stroke-width": context.strokeWidth(entity),
        "stroke-dasharray": context.strokeDasharray(entity),
        transform: transform,
        children: contents
      }), [x + bbox.x * xscale, x + (bbox.x + bbox.w) * xscale], [y + bbox.y * yscale, y + (bbox.y + bbox.h) * yscale]];
    }
  };
  return entitySvgMap;
};

const entitiesSvg = (entities, entitySvgMap, options) => {
  const {
    warn
  } = options;
  let s = '';
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  if (entities) {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const entityType = getGroupCodeValue(entity, 0);

      if (!entityType) {
        continue;
      }

      const vertices = [];

      while (getGroupCodeValue(entities[i + 1], 0) === 'VERTEX') {
        vertices.push(entities[++i]);
      }

      if (vertices.length !== 0 && getGroupCodeValue(entities[i + 1], 0) === 'SEQEND') {
        i++;
      }

      try {
        const entitySvg = entitySvgMap[entityType];

        if (entitySvg) {
          const svg = entitySvg(entity, vertices);

          if (svg) {
            s += svg[0];
            const xs = svg[1].filter(x => isFinite(x));
            const ys = svg[2].filter(y => isFinite(y));
            minX = Math.min(minX, ...xs);
            maxX = Math.max(maxX, ...xs);
            minY = Math.min(minY, ...ys);
            maxY = Math.max(maxY, ...ys);
          }
        } else {
          warn(`Unknown entity type: ${entityType}`, entity);
        }
      } catch (error) {
        warn(`Error occurred: ${error}`, entity);
      }
    }
  }

  return [s, {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  }];
};

const createSvgContents = (dxf, options) => {
  const resolvedOptions = options ? { ...defaultOptions,
    ...options
  } : defaultOptions;
  return entitiesSvg(dxf.ENTITIES, createEntitySvgMap(dxf, resolvedOptions), resolvedOptions);
};

const createSvgString = (dxf, options) => {
  const [s, {
    x,
    y,
    w,
    h
  }] = createSvgContents(dxf, options);
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: `${x} ${y} ${w} ${h}`,
    width: w,
    height: h,
    children: s
  });
};

export { createSvgContents, createSvgString };
