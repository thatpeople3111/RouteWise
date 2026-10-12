import { allowedPublicUrl } from './providers';
import type { FareRequest } from './types';
export interface PublicFareSource { url: string; text: string }
/** Ordinary public HTTPS pages only. No cookies, authorization, redirects, or challenge retries. */
export async function fetchPublicFareSource(request: FareRequest, fetchImpl: typeof fetch = fetch): Promise<PublicFareSource | null> {
  const url = request.providerMetadata?.sourceUrl;
  if (!url || !allowedPublicUrl(request.provider, url)) return null;
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { Accept: 'text/html, application/json' } });
    if (!response.ok || !/text\/html|application\/json/.test(response.headers.get('content-type') ?? '')) return null;
    const reader = response.body?.getReader(); if (!reader) return null;
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 250000) { await reader.cancel(); return null; } chunks.push(part.value); }
    const decoder = new TextDecoder();
    const raw = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
    if (/captcha|verify you are human|access denied|sign in to continue/i.test(raw)) return null;
    const text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 40000);
    return text ? { url, text } : null;
  } catch { return null; }
}
