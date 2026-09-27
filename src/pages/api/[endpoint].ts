import type { NextApiRequest, NextApiResponse } from 'next';
import { handlePlanTrip } from '../../server/routes/planTrip';
import { handleSafeWait } from '../../server/routes/safeWait';
import { handleSuggestStops } from '../../server/routes/suggestStops';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const endpoint = req.query.endpoint;
  if (endpoint === 'health' && req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'routewise-backend' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    switch (endpoint) {
      case 'plan-trip': return await handlePlanTrip(req, res);
      case 'suggest-stops': return await handleSuggestStops(req, res);
      case 'safe-wait': return await handleSafeWait(req, res);
      default: return res.status(404).json({ error: 'Not found.' });
    }
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'The trip service could not complete this request.' });
    else res.end();
  }
}
