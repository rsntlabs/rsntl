const QUERY1 = 'https://query1.finance.yahoo.com';
const QUERY2 = 'https://query2.finance.yahoo.com';
const FC     = 'https://fc.yahoo.com';
const CRUMB_URL = `${QUERY1}/v1/test/getcrumb`;

export interface YahooCrumb {
  crumb: string;
  cookie: string;
}

export async function getCrumb(kv: KVNamespace): Promise<YahooCrumb> {
  const cached = await kv.get('crumb', 'json') as YahooCrumb | null;
  if (cached) return cached;

  // Get cookie
  const fcResp = await fetch(FC, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const cookie = fcResp.headers.get('set-cookie') ?? '';

  // Get crumb
  const crumbResp = await fetch(CRUMB_URL, {
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0',
    },
  });
  const crumb = await crumbResp.text();

  const result: YahooCrumb = { crumb, cookie };
  await kv.put('crumb', JSON.stringify(result), { expirationTtl: 3600 });
  return result;
}

export async function quoteSummary(ticker: string, modules: string[], crumb: string, cookie: string) {
  const moduleStr = modules.join(',');
  const url = `${QUERY2}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${moduleStr}&crumb=${encodeURIComponent(crumb)}`;
  const resp = await fetch(url, {
    headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) throw new Error(`Yahoo quoteSummary ${resp.status}`);
  const data = await resp.json() as any;
  return data.quoteSummary?.result?.[0] ?? null;
}

export async function chart(ticker: string, range: string, interval: string, crumb: string, cookie: string) {
  const url = `${QUERY1}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}&crumb=${encodeURIComponent(crumb)}`;
  const resp = await fetch(url, {
    headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) throw new Error(`Yahoo chart ${resp.status}`);
  const data = await resp.json() as any;
  return data.chart?.result?.[0] ?? null;
}

export async function options(ticker: string, expiration: number | undefined, crumb: string, cookie: string) {
  let url = `${QUERY1}/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(crumb)}`;
  if (expiration) url += `&date=${expiration}`;
  const resp = await fetch(url, {
    headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  return data.optionChain?.result?.[0] ?? null;
}
