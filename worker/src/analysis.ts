import { getCrumb, quoteSummary, chart, options } from './yahoo.js';
import { bsmGreeks, monteCarloTerminalPrices } from './quantcalc.js';
import { capmRequiredReturn, gordonGrowthReturn, grahamIntrinsicValue, applyMarginOfSafety } from './formulas.js';
import type { AnalysisResponse, Strategy, GreekSet, Env } from './types.js';

function pct(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function ttmSum(quarters: any[], field: string): number | null {
  if (!quarters || quarters.length < 4) return null;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const v = quarters[i]?.[field]?.raw;
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

function realizedVol(closes: number[]): number | null {
  if (closes.length < 2) return null;
  const logs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logs.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const variance = logs.reduce((s, v) => s + (v - mean) ** 2, 0) / (logs.length - 1);
  return Math.sqrt(variance * 252);
}

function findAtm(chain: any[], spot: number, type: 'calls' | 'puts') {
  const contracts: any[] = chain[0]?.options?.[0]?.[type] ?? [];
  if (!contracts.length) return null;
  return contracts.reduce((best: any, c: any) => {
    const bDiff = Math.abs((best.strike?.raw ?? 0) - spot);
    const cDiff = Math.abs((c.strike?.raw ?? 0) - spot);
    return cDiff < bDiff ? c : best;
  });
}

function buildGreekSet(contract: any, spot: number, r: number, dte: number, realVol: number | null, type: 'call' | 'put'): GreekSet | null {
  if (!contract) return null;
  const strike = contract.strike?.raw ?? null;
  const iv = contract.impliedVolatility?.raw ?? realVol ?? 0.25;
  const price = contract.lastPrice?.raw ?? null;
  if (strike == null) return null;

  const greeks = bsmGreeks({ type, spot, strike, dte, iv, r, q: 0 });
  return {
    price,
    delta: greeks.delta,
    gamma: greeks.gamma,
    theta: greeks.theta,
    vega: greeks.vega,
    rho: greeks.rho,
    strike,
    expiry: contract.expiration ? new Date(contract.expiration.raw * 1000).toISOString().split('T')[0] : null,
  };
}

export async function analyze(ticker: string, env: Env): Promise<AnalysisResponse> {
  const { crumb, cookie } = await getCrumb(env.CRUMB_CACHE);

  const [summary, chart1y, chartMax, optChain] = await Promise.all([
    quoteSummary(ticker, [
      'price', 'summaryDetail', 'defaultKeyStatistics', 'financialData',
      'incomeStatementHistoryQuarterly', 'earnings', 'calendarEvents',
    ], crumb, cookie),
    chart(ticker, '1y', '1d', crumb, cookie),
    chart(ticker, 'max', '1d', crumb, cookie),
    options(ticker, undefined, crumb, cookie).catch(() => null),
  ]);

  if (!summary) throw new Error('No data from Yahoo Finance');

  // Price data
  const spot = summary.price?.regularMarketPrice?.raw ?? 0;
  const marketCapB = (summary.price?.marketCap?.raw ?? 0) / 1e9;

  // Historical closes for realized vol and ATH
  const closes1y: number[] = chart1y?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
  const closesMax: number[] = chartMax?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
  const timestampsMax: number[] = chartMax?.timestamp ?? [];
  const rv = realizedVol(closes1y);

  let athClose: number | null = null, athDate: string | null = null;
  if (closesMax.length) {
    let maxI = 0;
    for (let i = 1; i < closesMax.length; i++) if (closesMax[i] > closesMax[maxI]) maxI = i;
    athClose = closesMax[maxI];
    athDate = timestampsMax[maxI] ? new Date(timestampsMax[maxI] * 1000).toISOString().split('T')[0] : null;
  }

  // Quarterly data
  const iqs = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
  const totalRevenues = iqs.map((q: any) => q.totalRevenue?.raw ?? null);
  const netIncomes = iqs.map((q: any) => q.netIncome?.raw ?? null);
  void netIncomes; // available for future use

  // EPS from earnings
  const epsList = summary.earnings?.earningsChart?.quarterly ?? [];
  const epsActuals = epsList.map((e: any) => e.actual?.raw ?? null);

  const salesQoQ = pct(totalRevenues[0], totalRevenues[1]);
  const salesTtm = ttmSum(iqs, 'totalRevenue');
  const salesPrevTtm = iqs.length >= 8 ? (() => { let s = 0; for (let i = 4; i < 8; i++) { const v = iqs[i]?.totalRevenue?.raw; if (v == null) return null; s += v; } return s; })() : null;
  const salesYoY = pct(salesTtm, salesPrevTtm);

  const epsTtm = summary.defaultKeyStatistics?.trailingEps?.raw ?? null;
  const epsForward = summary.defaultKeyStatistics?.forwardEps?.raw ?? null;
  const epsQoQ = pct(epsActuals[0], epsActuals[1]);
  const epsPrevTtm = epsActuals.length >= 8 ? (() => { let s = 0; for (let i = 4; i < 8; i++) { if (epsActuals[i] == null) return null; s += epsActuals[i]; } return s; })() : null;
  const epsTtmCalc = epsActuals.length >= 4 ? epsActuals.slice(0, 4).reduce((a: number, b: number) => a + b, 0) : null;
  const epsYoY = pct(epsTtmCalc, epsPrevTtm);

  const beta = summary.defaultKeyStatistics?.beta?.raw ?? null;

  // CAPM
  const rf = 0.045, rm = 0.10;
  const required = beta != null ? capmRequiredReturn(rf, beta, rm) : null;
  const ggReturn = (epsForward != null && spot > 0)
    ? gordonGrowthReturn(epsForward, spot, 0.05)
    : null;

  // Graham
  const gPct = beta != null && epsTtm != null
    ? Math.min(Math.max(summary.financialData?.revenueGrowth?.raw ?? 0.05, 0) * 100, 25)
    : null;
  const gross = (epsTtm != null && gPct != null) ? grahamIntrinsicValue(epsTtm, gPct) : null;
  const mosAmt = gross != null ? applyMarginOfSafety(gross) : null;

  // Monte Carlo
  const mu = 0.08, sigma = rv ?? 0.25;
  const mcFinals = monteCarloTerminalPrices(spot, mu, sigma, 252, 10_000);
  const above = mcFinals.filter(p => p > spot).length;
  const pAbove = above / mcFinals.length;
  const median = mcFinals[Math.floor(mcFinals.length * 0.5)];
  const p10 = mcFinals[Math.floor(mcFinals.length * 0.10)];
  const p90 = mcFinals[Math.floor(mcFinals.length * 0.90)];

  // Options
  const expirations: number[] = optChain?.expirationDates ?? [];
  const expiry = expirations[0] ?? null;
  const dte = expiry ? Math.round((expiry * 1000 - Date.now()) / 86400000) : null;

  const atmCallContract = optChain ? findAtm([optChain], spot, 'calls') : null;
  const atmPutContract  = optChain ? findAtm([optChain], spot, 'puts')  : null;
  const atmIv = atmCallContract?.impliedVolatility?.raw ?? null;
  const ivPremiumPct = (atmIv != null && rv != null && rv > 0)
    ? ((atmIv - rv) / rv) * 100
    : null;

  const atmCall = buildGreekSet(atmCallContract, spot, rf, dte ?? 30, rv, 'call');
  const atmPut  = buildGreekSet(atmPutContract,  spot, rf, dte ?? 30, rv, 'put');

  // Build 5 strategies
  const strategies: Strategy[] = buildStrategies(optChain, spot, rf, dte ?? 30, rv);

  return {
    profile: {
      ticker: ticker.toUpperCase(),
      name: summary.price?.longName ?? summary.price?.shortName ?? ticker,
      exchange: summary.price?.exchangeName ?? '',
      sector: summary.summaryProfile?.sector ?? '',
      industry: summary.summaryProfile?.industry ?? '',
      description: summary.summaryProfile?.longBusinessSummary ?? '',
    },
    asOf: new Date().toISOString(),
    price: {
      last: spot,
      marketCapB,
      week52High: summary.summaryDetail?.fiftyTwoWeekHigh?.raw ?? 0,
      week52Low: summary.summaryDetail?.fiftyTwoWeekLow?.raw ?? 0,
      athClose,
      athDate,
      distAthPct: (athClose && spot) ? pct(spot, athClose) : null,
    },
    fundamentals: {
      marketCapB,
      trailingPe: summary.summaryDetail?.trailingPE?.raw ?? null,
      forwardPe: summary.summaryDetail?.forwardPE?.raw ?? null,
      quickRatio: summary.financialData?.quickRatio?.raw ?? null,
      currentRatio: summary.financialData?.currentRatio?.raw ?? null,
      salesQoQPct: salesQoQ,
      salesYoYTtmPct: salesYoY,
      epsQoQPct: epsQoQ,
      epsYoYTtmPct: epsYoY,
      epsTtm,
      epsForward,
      beta,
    },
    capm: { rf, rm, beta, required, ggReturn, undervalued: (ggReturn != null && required != null) ? ggReturn > required : null },
    graham: { gPct, gross, mosAmt, final: mosAmt, undervalued: (mosAmt != null && spot > 0) ? mosAmt > spot : null },
    monteCarlo: { pAbove, median, p10, p90, finals: mcFinals },
    options: {
      expiry: expiry ? new Date(expiry * 1000).toISOString().split('T')[0] : null,
      dte,
      atmIv,
      realizedVol: rv,
      ivPremiumPct,
      atmCall,
      atmPut,
      strategies,
    },
  };
}

function buildStrategies(optChain: any, spot: number, r: number, dte: number, rv: number | null): Strategy[] {
  function getContract(type: 'calls' | 'puts', offset: number) {
    const contracts: any[] = optChain?.[0]?.options?.[0]?.[type]
      ?? optChain?.options?.[0]?.[type] ?? [];
    if (!contracts.length) return null;
    const sorted = [...contracts].sort((a, b) =>
      Math.abs((a.strike?.raw ?? 0) - spot) - Math.abs((b.strike?.raw ?? 0) - spot)
    );
    return sorted[offset] ?? null;
  }

  function mkGreeks(c: any, type: 'call' | 'put'): GreekSet | null {
    return buildGreekSet(c, spot, r, dte, rv, type);
  }

  const atmC  = getContract('calls', 0);
  const atmP  = getContract('puts',  0);
  const oitmC = getContract('calls', 2); // slightly OTM call for spread
  const atmPg = getContract('puts',  0);
  const atmCc = getContract('calls', 0);

  const strategies: Strategy[] = [
    // 1. Long Call ATM
    {
      name: 'Long Call ATM',
      description: 'Buy ATM call — bullish, defined risk',
      maxProfit: null,
      maxLoss: atmC?.lastPrice?.raw ?? null,
      breakeven: atmC ? (atmC.strike?.raw ?? 0) + (atmC.lastPrice?.raw ?? 0) : null,
      legs: [{ type: 'call', action: 'buy', strike: atmC?.strike?.raw ?? null, price: atmC?.lastPrice?.raw ?? null, greeks: mkGreeks(atmC, 'call') }],
    },
    // 2. Long Put ATM
    {
      name: 'Long Put ATM',
      description: 'Buy ATM put — bearish, defined risk',
      maxProfit: atmP ? (atmP.strike?.raw ?? 0) - (atmP.lastPrice?.raw ?? 0) : null,
      maxLoss: atmP?.lastPrice?.raw ?? null,
      breakeven: atmP ? (atmP.strike?.raw ?? 0) - (atmP.lastPrice?.raw ?? 0) : null,
      legs: [{ type: 'put', action: 'buy', strike: atmP?.strike?.raw ?? null, price: atmP?.lastPrice?.raw ?? null, greeks: mkGreeks(atmP, 'put') }],
    },
    // 3. Bull Call Spread
    {
      name: 'Bull Call Spread',
      description: 'Buy ATM call, sell OTM call — bullish, reduced cost',
      maxProfit: null,
      maxLoss: null,
      breakeven: null,
      legs: [
        { type: 'call', action: 'buy',  strike: atmC?.strike?.raw ?? null,  price: atmC?.lastPrice?.raw ?? null,  greeks: mkGreeks(atmC,  'call') },
        { type: 'call', action: 'sell', strike: oitmC?.strike?.raw ?? null, price: oitmC?.lastPrice?.raw ?? null, greeks: mkGreeks(oitmC, 'call') },
      ],
    },
    // 4. Cash-Secured Put
    {
      name: 'Cash-Secured Put',
      description: 'Sell ATM put, secured with cash — income / acquisition',
      maxProfit: atmPg?.lastPrice?.raw ?? null,
      maxLoss: null,
      breakeven: atmPg ? (atmPg.strike?.raw ?? 0) - (atmPg.lastPrice?.raw ?? 0) : null,
      legs: [{ type: 'put', action: 'sell', strike: atmPg?.strike?.raw ?? null, price: atmPg?.lastPrice?.raw ?? null, greeks: mkGreeks(atmPg, 'put') }],
    },
    // 5. Covered Call
    {
      name: 'Covered Call',
      description: 'Own shares, sell ATM call — income generation',
      maxProfit: atmCc?.lastPrice?.raw ?? null,
      maxLoss: null,
      breakeven: null,
      legs: [{ type: 'call', action: 'sell', strike: atmCc?.strike?.raw ?? null, price: atmCc?.lastPrice?.raw ?? null, greeks: mkGreeks(atmCc, 'call') }],
    },
  ];

  return strategies;
}
