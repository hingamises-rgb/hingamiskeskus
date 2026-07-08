// Meta Marketing API: loeb reklaamikulud kuude lõikes.
// Vajab env: META_ACCESS_TOKEN (system user token, ads_read), META_AD_ACCOUNT_ID (act_...)

const TOKEN = import.meta.env.META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
const ACCOUNT = import.meta.env.META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || '';

export const metaConfigured = !!(TOKEN && ACCOUNT);

export interface MonthlySpend {
  month: string; // YYYY-MM
  spend: number;
}

// Tagastab viimase ~12 kuu Meta reklaamikulud kuude kaupa.
// Vea korral tagastab null (vaade langeb tagasi käsitsi sisestusele).
export async function fetchMetaMonthlySpend(): Promise<MonthlySpend[] | null> {
  if (!metaConfigured) return null;

  const until = new Date().toISOString().slice(0, 10);
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - 12);
  sinceDate.setDate(1);
  const since = sinceDate.toISOString().slice(0, 10);

  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `https://graph.facebook.com/v23.0/${ACCOUNT}/insights?level=account&fields=spend&time_increment=monthly&time_range=${timeRange}&access_token=${TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Meta API viga:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return (data.data || []).map((row: any) => ({
      month: String(row.date_start).slice(0, 7),
      spend: Number(row.spend) || 0,
    }));
  } catch (e) {
    console.error('Meta API päring ebaõnnestus:', e);
    return null;
  }
}
