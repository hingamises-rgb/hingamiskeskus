// Avalik konfiguratsioon kliendivoo UI-le (hinnad, horisont). Autoriteetne hind
// arvutatakse alati serveris broneeringu loomisel — see on ainult kuvamiseks.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getSettings } from '../../../lib/booking';

export const GET: APIRoute = async () => {
  try {
    const s = await getSettings();
    return new Response(JSON.stringify({
      floatCents: Number(s.price_float_cents || 4000),
      memberCents: Number(s.price_member_cents || 3000),
      groupCents: Number(s.price_group_cents || 4000),
      rentSuurCents: Number(s.rent_suur_cents_h || 2500),
      rentVaikeCents: Number(s.rent_vaike_cents_h || 700),
      horizonDays: Number(s.horizon_days || 92),
      cutoffMin: Number(s.cutoff_min || 60),
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return new Response(JSON.stringify({ error: 'server' }), { status: 500 });
  }
};
