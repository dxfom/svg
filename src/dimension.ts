import { DxfReadonly, DxfRecordReadonly, getGroupCodeValue as $ } from "@dxfom/dxf";
import { $number, round } from "./util";

const DimStyles = {
  DIMSCALE: [40, 40, 1],
  DIMTP: [47, 40, NaN],
  DIMTM: [48, 40, NaN],
  DIMTOL: [71, 70, 0],
  DIMTXT: [140, 40, 1],
  DIMLFAC: [144, 40, 1],
  DIMCLRT: [178, 70, NaN],
  DIMDEC: [271, 70, 4],
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

const toleranceString = (n: number) => n > 0 ? '+' + n : n < 0 ? String(n) : ' 0'

export const dimensionValueToMText = (measurement: number, dimension: DxfRecordReadonly, styles: DimensionStyles) => {
  const savedValue = $number(dimension, 42, -1)
  const value = round(savedValue !== -1 ? savedValue : measurement * styles.DIMLFAC, styles.DIMDEC)
  let valueWithTolerance = String(value)
  if (styles.DIMTOL) {
    const p = styles.DIMTP
    const n = styles.DIMTM
    if (p || n) {
      if (p === n) {
        valueWithTolerance = `${value}  ±${p}`
      } else {
        valueWithTolerance = `${value}  {\\S${toleranceString(p)}^${toleranceString(-n)};}`
      }
    }
  }
  const template = $(dimension, 1)
  return template ? template.replace(/<>/, valueWithTolerance) : valueWithTolerance
}
