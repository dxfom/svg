import { DXF_COLOR_HEX } from '@dxfom/color/hex';
import { getGroupCodeValue, getGroupCodeValues } from '@dxfom/dxf';
import { parseDxfMTextContent } from '@dxfom/mtext';
import { parseDxfTextContent } from '@dxfom/text';

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsx = (type, props) => {
  let s = '<' + type;
  let children;

  for (const [key, value] of Object.entries(props)) {
    if (!value) {
      continue;
    }

    if (key === 'children') {
      children = value;
    } else {
      s += ` ${key}="${typeof value === 'string' ? escapeHtml(value) : value}"`;
    }
  }

  if (type === 'line' || type === 'circle' || type === 'path') {
    if (!props.fill) {
      s += ' fill="none"';
    }

    s += ' vector-effect="non-scaling-stroke"';
  }

  if (type === 'text') {
    s += ' stroke="none" white-space="pre"';
  }

  if (children) {
    s += `>${Array.isArray(children) ? children.join('') : children}</${type}>`;
  } else {
    s += '/>';
  }

  return s;
};
const jsxs = jsx;

const defaultOptions = {
  warn: console.debug,
  resolveColorIndex: index => {
    var _DXF_COLOR_HEX$index;

    return (_DXF_COLOR_HEX$index = DXF_COLOR_HEX[index]) !== null && _DXF_COLOR_HEX$index !== void 0 ? _DXF_COLOR_HEX$index : '#888';
  }
};
const smallNumber = 1 / 64;

const nearlyEqual = (a, b) => Math.abs(a - b) < smallNumber;

const round = (() => {
  const _shift = (n, precision) => {
    const [d, e] = ('' + n).split('e');
    return +(d + 'e' + (e ? +e + precision : precision));
  };

  return (n, precision) => _shift(Math.round(_shift(n, precision)), -precision);
})();

const trim = s => s ? s.trim() : s;

const negate = s => !s ? s : s.startsWith('-') ? s.slice(1) : '-' + s;

const $trim = (record, groupCode) => trim(getGroupCodeValue(record, groupCode));

const $negate = (record, groupCode) => negate(trim(getGroupCodeValue(record, groupCode)));

const $number = (record, groupCode, defaultValue) => {
  const value = +getGroupCodeValue(record, groupCode);

  if (!isNaN(value)) {
    return value;
  }

  if (defaultValue === undefined) {
    return NaN;
  }

  return defaultValue;
};

const textDecorations = ({
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

const _MTEXT_dominantBaselines = [, 'text-before-edge', 'central', 'text-after-edge'];

const MTEXT_dominantBaseline = n => _MTEXT_dominantBaselines[+n / 3 | 0];

const _MTEXT_textAnchors = [,, 'middle', 'end'];

const MTEXT_textAnchor = n => _MTEXT_textAnchors[(+n | 0) % 3];

const TEXT_dominantBaseline = [, 'text-after-edge', 'central', 'text-before-edge'];
const TEXT_textAnchor = [, 'middle', 'end',, 'middle'];

const MTEXT_contents = (contents, i = 0) => {
  if (contents.length <= i) {
    return '';
  }

  const restContents = MTEXT_contents(contents, i + 1);
  const content = contents[i];

  if (typeof content === 'string') {
    return content + restContents;
  }

  if (Array.isArray(content)) {
    return MTEXT_contents(content) + restContents;
  }

  if (content.S) {
    return jsxs("tspan", {
      children: [jsx("tspan", {
        dy: "-.5em",
        children: content.S[0]
      }), jsx("tspan", {
        dy: ".5em",
        children: content.S[2]
      })]
    }) + restContents;
  }

  if (content.f) {
    return jsx("tspan", {
      "font-family": content.f,
      "font-weight": content.b && 'bold',
      "font-style": content.i && 'italic',
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

const createEntitySvgMap = (dxf, options) => {
  const {
    warn,
    resolveColorIndex
  } = options;
  const layerMap = {};

  for (const layer of (_dxf$TABLES$LAYER = (_dxf$TABLES = dxf.TABLES) === null || _dxf$TABLES === void 0 ? void 0 : _dxf$TABLES.LAYER) !== null && _dxf$TABLES$LAYER !== void 0 ? _dxf$TABLES$LAYER : []) {
    var _dxf$TABLES$LAYER, _dxf$TABLES;

    if (getGroupCodeValue(layer, 0) === 'LAYER') {
      layerMap[getGroupCodeValue(layer, 2)] = {
        color: resolveColorIndex(+getGroupCodeValue(layer, 62)),
        ltype: getGroupCodeValue(layer, 6)
      };
    }
  }

  const ltypeMap = {};

  for (const ltype of (_dxf$TABLES$LTYPE = (_dxf$TABLES2 = dxf.TABLES) === null || _dxf$TABLES2 === void 0 ? void 0 : _dxf$TABLES2.LTYPE) !== null && _dxf$TABLES$LTYPE !== void 0 ? _dxf$TABLES$LTYPE : []) {
    var _dxf$TABLES$LTYPE, _dxf$TABLES2;

    if (getGroupCodeValue(ltype, 0) === 'LTYPE') {
      const _strokeDasharray = getGroupCodeValues(ltype, 49).map(trim).map(s => s.startsWith('-') ? s.slice(1) : s);

      const strokeDasharray = _strokeDasharray.length % 2 === 1 ? _strokeDasharray : _strokeDasharray[0] === '0' ? _strokeDasharray.slice(1) : _strokeDasharray.concat('0');
      ltypeMap[getGroupCodeValue(ltype, 2)] = {
        strokeDasharray: strokeDasharray.join(' ')
      };
    }
  }

  const _color = entity => {
    const colorIndex = $trim(entity, 62);

    if (colorIndex === '0') {
      return 'currentColor';
    }

    if (colorIndex && colorIndex !== '256') {
      return resolveColorIndex(+colorIndex);
    }

    const layer = layerMap[$trim(entity, 8)];

    if (layer) {
      return layer.color;
    }
  };

  const color = entity => _color(entity) || 'currentColor';

  const strokeDasharray = entity => {
    var _ltypeMap, _$, _layerMap;

    return (_ltypeMap = ltypeMap[(_$ = getGroupCodeValue(entity, 6)) !== null && _$ !== void 0 ? _$ : (_layerMap = layerMap[getGroupCodeValue(entity, 8)]) === null || _layerMap === void 0 ? void 0 : _layerMap.ltype]) === null || _ltypeMap === void 0 ? void 0 : _ltypeMap.strokeDasharray;
  };

  const extrusionStyle = entity => {
    const extrusionZ = +$trim(entity, 230);

    if (extrusionZ && Math.abs(extrusionZ + 1) < 1 / 64) {
      return 'transform:rotateY(180deg)';
    }
  };

  return {
    POINT: () => '',
    LINE: entity => jsx("line", {
      x1: $trim(entity, 10),
      y1: $negate(entity, 20),
      x2: $trim(entity, 11),
      y2: $negate(entity, 21),
      stroke: color(entity),
      "stroke-dasharray": strokeDasharray(entity),
      style: extrusionStyle(entity)
    }),
    POLYLINE: (entity, vertices) => {
      var _$2;

      const flags = +((_$2 = getGroupCodeValue(entity, 70)) !== null && _$2 !== void 0 ? _$2 : 0);
      let d = '';

      for (const vertex of vertices) {
        d += `${d ? 'L' : 'M'}${$trim(vertex, 10)} ${$negate(vertex, 20)}`;
      }

      if (flags & 1) {
        d += 'Z';
      }

      return jsx("path", {
        d: d,
        stroke: color(entity),
        "stroke-dasharray": strokeDasharray(entity),
        style: extrusionStyle(entity)
      });
    },
    LWPOLYLINE: entity => {
      var _$3;

      const flags = +((_$3 = getGroupCodeValue(entity, 70)) !== null && _$3 !== void 0 ? _$3 : 0);
      const xs = getGroupCodeValues(entity, 10);
      const ys = getGroupCodeValues(entity, 20);
      let d = '';

      for (let i = 0; i < xs.length; i++) {
        d += `${d ? 'L' : 'M'}${trim(xs[i])} ${negate(trim(ys[i]))}`;
      }

      if (flags & 1) {
        d += 'Z';
      }

      return jsx("path", {
        d: d,
        stroke: color(entity),
        "stroke-dasharray": strokeDasharray(entity),
        style: extrusionStyle(entity)
      });
    },
    CIRCLE: entity => jsx("circle", {
      cx: $trim(entity, 10),
      cy: $negate(entity, 20),
      r: $trim(entity, 40),
      stroke: color(entity),
      "stroke-dasharray": strokeDasharray(entity),
      style: extrusionStyle(entity)
    }),
    ARC: entity => {
      const cx = $number(entity, 10);
      const cy = $number(entity, 20);
      const r = $number(entity, 40);
      const deg1 = $number(entity, 50, 0);
      const deg2 = $number(entity, 51, 0);
      const rad1 = deg1 * Math.PI / 180;
      const rad2 = deg2 * Math.PI / 180;
      const x1 = cx + r * Math.cos(rad1);
      const y1 = cy + r * Math.sin(rad1);
      const x2 = cx + r * Math.cos(rad2);
      const y2 = cy + r * Math.sin(rad2);
      const large = (deg2 - deg1 + 360) % 360 <= 180 ? '0' : '1';
      return jsx("path", {
        d: `M${x1} ${-y1}A${r} ${r} 0 ${large} 0 ${x2} ${-y2}`,
        stroke: color(entity),
        "stroke-dasharray": strokeDasharray(entity),
        style: extrusionStyle(entity)
      });
    },
    ELLIPSE: entity => {
      // https://wiki.gz-labs.net/index.php/ELLIPSE
      const cx = $number(entity, 10);
      const cy = $number(entity, 20);
      const majorX = $number(entity, 11);
      const majorY = $number(entity, 21);
      const majorR = Math.sqrt(majorX * majorX + majorY * majorY);
      const minorR = $number(entity, 40) * majorR;
      const radAngleOffset = -Math.atan2(majorY, majorX);
      const rad1 = $number(entity, 41, 0);
      const rad2 = $number(entity, 42, 2 * Math.PI);

      if (nearlyEqual(rad1, 0) && nearlyEqual(rad2, 2 * Math.PI)) {
        return jsx("ellipse", {
          cx: cx,
          cy: -cy,
          rx: majorR,
          ry: minorR,
          stroke: color(entity),
          "stroke-dasharray": strokeDasharray(entity),
          transform: radAngleOffset && `rotate(${radAngleOffset * 180 / Math.PI} ${cx} ${-cy})`,
          style: extrusionStyle(entity)
        });
      } else {
        warn('Elliptical arc cannot be rendered yet.');
        return '';
      }
    },
    LEADER: entity => {
      const xs = getGroupCodeValues(entity, 10);
      const ys = getGroupCodeValues(entity, 20);
      let d = '';

      for (let i = 0; i < xs.length; i++) {
        d += `${d ? 'L' : 'M'}${trim(xs[i])} ${negate(trim(ys[i]))}`;
      }

      return jsx("path", {
        d: d,
        stroke: color(entity),
        "stroke-dasharray": strokeDasharray(entity)
      });
    },
    HATCH: entity => {
      const paths = entity.slice(entity.findIndex(groupCode => groupCode[0] === 92), entity.findIndex(groupCode => groupCode[0] === 97));
      const x1s = getGroupCodeValues(paths, 10).map(trim);
      const y1s = getGroupCodeValues(paths, 20).map(trim).map(negate);
      const x2s = getGroupCodeValues(paths, 11).map(trim);
      const y2s = getGroupCodeValues(paths, 21).map(trim).map(negate);
      let d = '';

      for (let i = 0; i < x1s.length; i++) {
        if (!x2s[i]) {
          d += `${i === 0 ? 'M' : 'L'}${x1s[i]} ${y1s[i]}`;
        } else if (x1s[i] === x2s[i - 1] && y1s[i] === y2s[i - 1]) {
          d += `L${x2s[i]} ${y2s[i]}`;
        } else {
          d += `M${x1s[i]} ${y1s[i]}L${x2s[i]} ${y2s[i]}`;
        }
      }

      return jsx("path", {
        fill: color(entity) || 'currentColor',
        "fill-opacity": ".3",
        d: d
      });
    },
    SOLID: entity => {
      const x1 = $trim(entity, 10);
      const y1 = $negate(entity, 20);
      const x2 = $trim(entity, 11);
      const y2 = $negate(entity, 21);
      const x3 = $trim(entity, 12);
      const y3 = $negate(entity, 22);
      const x4 = $trim(entity, 13);
      const y4 = $negate(entity, 23);
      const d = `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}${x3 !== x4 || y3 !== y4 ? `L${x4} ${y4}` : ''}Z`;
      return jsx("path", {
        d: d,
        fill: color(entity)
      });
    },
    TEXT: entity => {
      const x = $trim(entity, 10);
      const y = $negate(entity, 20);
      const angle = $negate(entity, 50);
      const contents = parseDxfTextContent(getGroupCodeValue(entity, 1) || '');
      return jsx("text", {
        x: x,
        y: y,
        "font-size": $trim(entity, 40),
        fill: color(entity),
        "dominant-baseline": TEXT_dominantBaseline[$trim(entity, 72)],
        "text-anchor": TEXT_textAnchor[$trim(entity, 73)],
        transform: angle && `rotate(${angle} ${x} ${y})`,
        "text-decoration": contents.length === 1 && textDecorations(contents[0]),
        children: contents.length === 1 ? contents[0].text : contents.map(content => jsx("tspan", {
          "text-decoration": textDecorations(content),
          children: content.text
        }))
      });
    },
    MTEXT: entity => {
      var _$4;

      const attachmentPoint = $trim(entity, 71);
      return jsx("text", {
        fill: color(entity),
        x: $trim(entity, 10),
        y: $negate(entity, 20),
        "font-size": $trim(entity, 40),
        "dominant-baseline": MTEXT_dominantBaseline(attachmentPoint),
        "text-anchor": MTEXT_textAnchor(attachmentPoint),
        children: MTEXT_contents(parseDxfMTextContent(getGroupCodeValues(entity, 3).join('') + ((_$4 = getGroupCodeValue(entity, 1)) !== null && _$4 !== void 0 ? _$4 : '')))
      });
    },
    DIMENSION: entity => {
      var _dxf$TABLES3, _dxf$TABLES3$DIMSTYLE, _dxf$HEADER;

      const styleName = getGroupCodeValue(entity, 3);
      const style = (_dxf$TABLES3 = dxf.TABLES) === null || _dxf$TABLES3 === void 0 ? void 0 : (_dxf$TABLES3$DIMSTYLE = _dxf$TABLES3.DIMSTYLE) === null || _dxf$TABLES3$DIMSTYLE === void 0 ? void 0 : _dxf$TABLES3$DIMSTYLE.find(style => getGroupCodeValue(style, 2) === styleName);
      let lineElements = '';
      let value = $number(entity, 42, 0);

      switch ($number(entity, 70, 0) & 7) {
        case 0: // Rotated, Horizontal, or Vertical

        case 1:
          // Aligned
          {
            const x1 = $trim(entity, 13);
            const y1 = $negate(entity, 23);
            const x3 = $trim(entity, 10);
            const y3 = $negate(entity, 20);
            const x4 = $trim(entity, 14);
            const y4 = $negate(entity, 24);
            const [x2, y2] = x3 === x4 ? [x1, y3] : [x3, y1];
            value = value || Math.abs(x3 === x4 ? +y3 - +y1 : +x3 - +x1) * $number(style, 144, 1);
            lineElements = jsx("path", {
              d: `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}L${x4} ${y4}`
            });
            break;
          }

        case 2: // Angular

        case 5:
          // Angular 3-point
          warn('Angular dimension cannot be rendered yet.', entity);
          break;

        case 3: // Diameter

        case 4:
          // Radius
          warn('Diameter / radius dimension cannot be rendered yet.', entity);
          break;

        case 6:
          // Ordinate
          warn('Ordinate dimension cannot be rendered yet.', entity);
          break;
      }

      value = round(value, +getGroupCodeValue(style, 271) || +getGroupCodeValue((_dxf$HEADER = dxf.HEADER) === null || _dxf$HEADER === void 0 ? void 0 : _dxf$HEADER.$DIMDEC, 70) || 4);
      let textElement;
      {
        var _dxf$HEADER2, _dxf$HEADER3, _$$replace, _$5;

        const x = $trim(entity, 11);
        const y = $negate(entity, 21);
        const h = (+getGroupCodeValue(style, 140) || +getGroupCodeValue((_dxf$HEADER2 = dxf.HEADER) === null || _dxf$HEADER2 === void 0 ? void 0 : _dxf$HEADER2.$DIMTXT, 40)) * (+getGroupCodeValue(style, 40) || +getGroupCodeValue((_dxf$HEADER3 = dxf.HEADER) === null || _dxf$HEADER3 === void 0 ? void 0 : _dxf$HEADER3.$DIMSCALE, 40) || 1);
        const angle = $negate(entity, 50);
        const text = (_$$replace = (_$5 = getGroupCodeValue(entity, 1)) === null || _$5 === void 0 ? void 0 : _$5.replace(/<>/, value)) !== null && _$$replace !== void 0 ? _$$replace : String(value);
        textElement = jsx("text", {
          x: x,
          y: y,
          "font-size": h,
          fill: color(entity),
          "dominant-baseline": "text-after-edge",
          "text-anchor": "middle",
          transform: angle && `rotate(${angle} ${x} ${y})`,
          children: MTEXT_contents(parseDxfMTextContent(text))
        });
      }
      return jsx("g", {
        stroke: color(entity) || 'currentColor',
        "stroke-dasharray": strokeDasharray(entity),
        style: extrusionStyle(entity),
        children: lineElements + textElement
      });
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
      const lineColor = color(entity) || 'currentColor';
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
          var _$6;

          s += jsx("text", {
            x: x,
            y: y,
            fill: !isNaN(color) ? resolveColorIndex(color) : textColor,
            children: MTEXT_contents(parseDxfMTextContent((_$6 = getGroupCodeValue(cell, 1)) !== null && _$6 !== void 0 ? _$6 : ''))
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
      return jsx("g", {
        "font-size": $trim(entity, 140),
        "dominant-baseline": "text-before-edge",
        transform: `translate(${$trim(entity, 10)},${$negate(entity, 20)})`,
        children: s
      });
    },
    INSERT: entity => {
      var _dxf$BLOCKS;

      const x = $trim(entity, 10);
      const y = $negate(entity, 20);
      const rotate = $negate(entity, 50);
      const xscale = $trim(entity, 41) || 1;
      const yscale = $trim(entity, 42) || 1;
      const transform = [+x || +y ? `translate(${x},${y})` : '', +xscale !== 1 || +yscale !== 1 ? `scale(${xscale},${yscale})` : '', rotate ? `rotate(${rotate})` : ''].filter(Boolean).join(' ');

      const _block = (_dxf$BLOCKS = dxf.BLOCKS) === null || _dxf$BLOCKS === void 0 ? void 0 : _dxf$BLOCKS[getGroupCodeValue(entity, 2)];

      const block = _block === null || _block === void 0 ? void 0 : _block.slice(getGroupCodeValue(_block[0], 0) === 'BLOCK' ? 1 : 0, getGroupCodeValue(_block[_block.length - 1], 0) === 'ENDBLK' ? -1 : undefined);
      const contents = entitiesToSvgString(dxf, block, options);
      return jsx("g", {
        color: _color(entity),
        transform: transform,
        children: contents
      });
    }
  };
};

const isNotNaN = n => !isNaN(n);

const viewBox = ({
  ENTITIES
}) => {
  if (!ENTITIES) {
    return '';
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entity of ENTITIES) {
    const xs = [+getGroupCodeValue(entity, 10), +getGroupCodeValue(entity, 11), +getGroupCodeValue(entity, 12)].filter(isNotNaN);
    const ys = [-getGroupCodeValue(entity, 20), -getGroupCodeValue(entity, 21), -getGroupCodeValue(entity, 22)].filter(isNotNaN);
    minX = Math.min(minX, ...xs);
    maxX = Math.max(maxX, ...xs);
    minY = Math.min(minY, ...ys);
    maxY = Math.max(maxY, ...ys);
  }

  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
};

const entitiesToSvgString = (dxf, entities, options) => {
  const {
    warn
  } = options;
  const entitySvgMap = createEntitySvgMap(dxf, options);
  let s = '';

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

      const entitySvg = entitySvgMap[entityType];

      if (entitySvg) {
        s += entitySvg(entity, vertices);
      } else {
        warn(`Unknown entity type: ${entityType}`, entity);
      }
    }
  }

  return s;
};

const createSvgString = (dxf, options) => {
  const resolvedOptions = options ? { ...defaultOptions,
    ...options
  } : defaultOptions;
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: viewBox(dxf),
    children: entitiesToSvgString(dxf, dxf.ENTITIES, resolvedOptions)
  });
};

export { createSvgString };
