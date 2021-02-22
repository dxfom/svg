import { DxfRecordReadonly, getGroupCodeValue as $ } from '@dxfom/dxf'

const smallNumber = 1 / 64
export const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < smallNumber
export const round = (() => {
  const _shift = (n: number, precision: number): number => {
    const [d, e] = ('' + n).split('e')
    return +(d + 'e' + (e ? +e + precision : precision))
  }
  return (n: number, precision: number) => _shift(Math.round(_shift(n, precision)), -precision)
})()

export const trim = (s: string | undefined) => s ? s.trim() : s
export const $trim = (record: DxfRecordReadonly | undefined, groupCode: number) => trim($(record, groupCode))
export const $number = (record: DxfRecordReadonly | undefined, groupCode: number, defaultValue?: number) => {
  const value = +$(record, groupCode)!
  if (isNaN(value)) {
    return defaultValue === undefined ? NaN : defaultValue
  }
  if (Math.abs(value) > 1e6) {
    throw Error(`group code ${groupCode} is invalid (${value})`)
  }
  const rounded = Math.round(value)
  return Math.abs(rounded - value) < 1e-8 ? rounded : value
}
export const $numbers = (record: DxfRecordReadonly, ...groupCodes: readonly number[]) => groupCodes.map(groupCode => $number(record, groupCode))
export const $negates = (record: DxfRecordReadonly, ...groupCodes: readonly number[]) => groupCodes.map(groupCode => -$number(record, groupCode))
