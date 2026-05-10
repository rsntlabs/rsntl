export interface GreekSet {
  price: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  strike: number | null;
  expiry: string | null;
}

export interface Strategy {
  name: string;
  description: string;
  maxProfit: number | null;
  maxLoss: number | null;
  breakeven: number | null;
  legs: StrategyLeg[];
}

export interface StrategyLeg {
  type: 'call' | 'put';
  action: 'buy' | 'sell';
  strike: number | null;
  price: number | null;
  greeks: GreekSet | null;
}

export interface AnalysisResponse {
  profile: {
    ticker: string;
    name: string;
    exchange: string;
    sector: string;
    industry: string;
    description: string;
  };
  asOf: string;
  price: {
    last: number;
    marketCapB: number;
    week52High: number;
    week52Low: number;
    athClose: number | null;
    athDate: string | null;
    distAthPct: number | null;
  };
  fundamentals: {
    marketCapB: number;
    trailingPe: number | null;
    forwardPe: number | null;
    quickRatio: number | null;
    currentRatio: number | null;
    salesQoQPct: number | null;
    salesYoYTtmPct: number | null;
    epsQoQPct: number | null;
    epsYoYTtmPct: number | null;
    epsTtm: number | null;
    epsForward: number | null;
    beta: number | null;
  };
  capm: {
    rf: number;
    rm: number;
    beta: number | null;
    required: number | null;
    ggReturn: number | null;
    undervalued: boolean | null;
  };
  graham: {
    gPct: number | null;
    gross: number | null;
    mosAmt: number | null;
    final: number | null;
    undervalued: boolean | null;
  };
  monteCarlo: {
    pAbove: number;
    median: number;
    p10: number;
    p90: number;
    finals: number[];
  };
  options: {
    expiry: string | null;
    dte: number | null;
    atmIv: number | null;
    realizedVol: number | null;
    ivPremiumPct: number | null;
    atmCall: GreekSet | null;
    atmPut: GreekSet | null;
    strategies: Strategy[];
  };
}

export interface Env {
  CRUMB_CACHE: KVNamespace;
  ALLOWED_ORIGINS?: string;
}
