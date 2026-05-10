export function capmRequiredReturn(rf: number, beta: number, rm: number): number {
  return rf + beta * (rm - rf);
}

export function gordonGrowthReturn(epsFwd: number, price: number, g: number): number {
  return (epsFwd / price) + g;
}

export function grahamIntrinsicValue(epsTtm: number, gPct: number): number {
  return epsTtm * (8.5 + 2 * gPct);
}

export function applyMarginOfSafety(value: number, mos = 0.20): number {
  return value * (1 - mos);
}
