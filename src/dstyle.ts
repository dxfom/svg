import { DxfRecordReadonly } from "@dxfom/dxf";

export const collectDimensionStyleOverrides = (d: DxfRecordReadonly) => {
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
