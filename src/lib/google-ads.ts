// Google Ads API: loeb reklaamikulud kuude lõikes (meta.ts eeskujul).
// Vajab env: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
// GOOGLE_ADS_REFRESH_TOKEN. Konto: 144-019-4743, halduskonto (login) 866-250-1699.

const DEV_TOKEN = import.meta.env.GOOGLE_ADS_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
const CLIENT_ID = import.meta.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || '';
const CLIENT_SECRET = import.meta.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || '';
const REFRESH_TOKEN = import.meta.env.GOOGLE_ADS_REFRESH_TOKEN || process.env.GOOGLE_ADS_REFRESH_TOKEN || '';

const CUSTOMER_ID = '1440194743';       // Hingamises OÜ reklaamikonto (ilma kriipsudeta)
const LOGIN_CUSTOMER_ID = '8662501699'; // halduskonto MCC (ilma kriipsudeta)
const API_VERSION = 'v22';              // NB: Google vahetab versiooni ~kord aastas; 404 korral tõsta

export const googleAdsConfigured = !!(DEV_TOKEN && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

export interface MonthlySpend {
  month: string; // YYYY-MM
  spend: number;
}

async function getAccessToken(): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    console.error('Google OAuth viga:', res.status, await res.text());
    return null;
  }
  return (await res.json()).access_token;
}

// Tagastab viimase ~12 kuu Google Ads kulud kuude kaupa.
// Vea korral tagastab null (vaade langeb tagasi käsitsi sisestusele).
export async function fetchGoogleMonthlySpend(): Promise<MonthlySpend[] | null> {
  if (!googleAdsConfigured) return null;

  try {
    const token = await getAccessToken();
    if (!token) return null;

    const until = new Date().toISOString().slice(0, 10);
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - 12);
    sinceDate.setDate(1);
    const since = sinceDate.toISOString().slice(0, 10);

    const query = `SELECT segments.month, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`;
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${CUSTOMER_ID}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'developer-token': DEV_TOKEN,
          'login-customer-id': LOGIN_CUSTOMER_ID,
        },
        body: JSON.stringify({ query }),
      },
    );
    if (!res.ok) {
      console.error('Google Ads API viga:', res.status, (await res.text()).slice(0, 300));
      return null;
    }

    // searchStream tagastab massiivi partiidest; summeeri kampaaniad kuude kaupa
    const batches = await res.json();
    const byMonth = new Map<string, number>();
    for (const batch of batches) {
      for (const row of batch.results || []) {
        const month = String(row.segments?.month || '').slice(0, 7); // '2026-07-01' -> '2026-07'
        const micros = Number(row.metrics?.costMicros || 0);
        if (month) byMonth.set(month, (byMonth.get(month) || 0) + micros);
      }
    }
    return [...byMonth.entries()]
      .map(([month, micros]) => ({ month, spend: Math.round(micros / 10000) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));
  } catch (e) {
    console.error('Google Ads API päring ebaõnnestus:', e);
    return null;
  }
}
