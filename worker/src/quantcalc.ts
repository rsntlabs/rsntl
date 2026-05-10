// BSM Greeks using Black-Scholes-Merton analytical formulas
function normCdf(x: number): number {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
  return 0.5 * (1 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BSMInput {
  type: 'call' | 'put';
  spot: number;
  strike: number;
  dte: number;    // calendar days to expiry
  iv: number;     // annualised implied vol (0.25 = 25%)
  r: number;      // risk-free rate (0.05 = 5%)
  q: number;      // continuous dividend yield (0.01 = 1%)
}

export interface BSMOutput {
  price: number;
  delta: number;
  gamma: number;
  theta: number;  // per calendar day
  vega: number;   // per 1% change in vol
  rho: number;    // per 1% change in rate
}

export function bsmGreeks(input: BSMInput): BSMOutput {
  const { type, spot: S, strike: K, dte, iv: sigma, r, q } = input;
  const T = dte / 365;
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { price: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nd1  = normCdf(d1);
  const nd2  = normCdf(d2);
  const Nd1  = normCdf(-d1);
  const Nd2  = normCdf(-d2);
  const npd1 = normPdf(d1);

  const eqT  = Math.exp(-q * T);
  const erT  = Math.exp(-r * T);

  let price: number, delta: number, rho: number;
  if (type === 'call') {
    price = S * eqT * nd1 - K * erT * nd2;
    delta = eqT * nd1;
    rho   = K * T * erT * nd2 / 100;
  } else {
    price = K * erT * Nd2 - S * eqT * Nd1;
    delta = -eqT * Nd1;
    rho   = -K * T * erT * Nd2 / 100;
  }

  const gamma = eqT * npd1 / (S * sigma * sqrtT);
  const vega  = S * eqT * npd1 * sqrtT / 100;
  const theta = (-(S * eqT * npd1 * sigma) / (2 * sqrtT)
                  - r * K * erT * (type === 'call' ? nd2 : -Nd2)
                  + q * S * eqT * (type === 'call' ? nd1 : -Nd1)) / 365;

  return { price, delta, gamma, theta, vega, rho };
}

// Monte Carlo GBM terminal price simulation
export function monteCarloTerminalPrices(
  s0: number, mu: number, sigma: number, days = 252, sims = 10_000
): number[] {
  // Seeded LCG for reproducibility
  let seed = 42;
  function lcg(): number {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0x100000000;
  }
  // Box-Muller
  function randn(): number {
    const u1 = lcg() || 1e-10;
    const u2 = lcg();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  const dt = 1 / 252;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const results: number[] = new Array(sims);
  for (let i = 0; i < sims; i++) {
    let S = s0;
    for (let d = 0; d < days; d++) {
      S *= Math.exp(drift + diffusion * randn());
    }
    results[i] = S;
  }
  results.sort((a, b) => a - b);
  return results;
}
