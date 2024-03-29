import { getGroupCodeValue as $, DxfReadonly, DxfRecordReadonly } from '@dxfom/dxf'
import { parseDxfMTextContent } from '@dxfom/mtext'
import { MTEXT_contents, MTEXT_contentsOptions } from './mtext'
import { $number } from './util'

const DimStyles = {
  DIMSCALE: [40, 40, 1],
  DIMASZ: [41, 40, 2.5],
  DIMTP: [47, 40, NaN],
  DIMTM: [48, 40, NaN],
  DIMTOL: [71, 70, 0],
  DIMTXT: [140, 40, 1],
  DIMLFAC: [144, 40, 1],
  DIMCLRD: [176, 70, 0],
  DIMCLRT: [178, 70, 0],
  DIMADEC: [179, 70, 0],
  DIMDEC: [271, 70, 2],
  DIMLWD: [371, 70, -2],
} as const

type MutableDimensionStyles = { -readonly [K in keyof typeof DimStyles]: number }
type DimensionStyles = { [K in keyof typeof DimStyles]: number }

const collectDimensionStyleOverrides = (d: DxfRecordReadonly) => {
  const result = new Map<number, string>()
  for (let i = 0; i < d.length; i++) {
    if (d[i][0] === 1000 && d[i][1].trim() === 'DSTYLE' && d[i + 1][0] === 1002 && d[i + 1][1].trim() === '{') {
      for (let j = i + 2; j < d.length; j++) {
        if (d[j][0] === 1002) {
          break
        }
        if (d[j][0] === 1070) {
          result.set(+d[j][1], d[++j][1])
        }
      }
      return result
    }
  }
}

export const collectDimensionStyles = (dxf: DxfReadonly, dimension: DxfRecordReadonly) => {
  const styleName = $(dimension, 3)
  const style = dxf.TABLES?.DIMSTYLE?.find(style => $(style, 2) === styleName)
  const styleOverrides = collectDimensionStyleOverrides(dimension)
  const styles = Object.create(null) as MutableDimensionStyles
  for (const [variableName, [groupCode, headerGroupCode, defaultValue]] of Object.entries(DimStyles)) {
    const value = styleOverrides?.get(groupCode) ?? $(style, groupCode) ?? $(dxf.HEADER?.['$' + variableName], headerGroupCode)
    styles[variableName as keyof typeof DimStyles] = value !== undefined ? +value : defaultValue
  }
  return styles
}

const toleranceString = (n: number) => (n > 0 ? '+' + n : n < 0 ? String(n) : ' 0')

const dimensionValueToMText = (measurement: number, dimension: DxfRecordReadonly, styles: DimensionStyles) => {
  const dimensionType = $number(dimension, 70, 0) & 7
  const savedValue = $number(dimension, 42, -1)
  let value =
    dimensionType === 2 || dimensionType === 5
      ? (((savedValue !== -1 ? savedValue : measurement) * 180) / Math.PI).toFixed(styles.DIMADEC !== -1 ? styles.DIMADEC : styles.DIMDEC) +
        '°'
      : (savedValue !== -1 ? savedValue : measurement * styles.DIMLFAC).toFixed(styles.DIMDEC)
  if (styles.DIMTOL) {
    const p = styles.DIMTP
    const n = styles.DIMTM
    if (p || n) {
      if (p === n) {
        value += `  ±${p}`
      } else {
        value += `  {\\S${toleranceString(p)}^${toleranceString(-n)};}`
      }
    }
  }
  const template = $(dimension, 1)
  return template ? template.replace(/<>/, value) : value
}

export const parseDimensionText = (
  measurement: number,
  dimension: DxfRecordReadonly,
  styles: DimensionStyles,
  options?: MTEXT_contentsOptions & { readonly encoding?: string | TextDecoder | undefined },
) => MTEXT_contents(parseDxfMTextContent(dimensionValueToMText(measurement, dimension, styles), options), options)
