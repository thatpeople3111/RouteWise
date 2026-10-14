import { validateExternalHandoffUrl } from '@/lib/externalHandoff';

export default function HandoffFallbackLinks({ url, webFallbackUrl }: { url: string; webFallbackUrl?: string }) {
  let primary: string, fallback: string | undefined;
  try { primary = validateExternalHandoffUrl(url); fallback = webFallbackUrl ? validateExternalHandoffUrl(webFallbackUrl) : undefined; }
  catch { return <p role="alert">No valid external navigation link is available.</p>; }
  return <p className="field-hint mt-2">
    <a href={primary} target="_blank" rel="noopener noreferrer">Open app or navigation link</a>
    {fallback && fallback !== primary && <> · <a href={fallback} target="_blank" rel="noopener noreferrer">Open web fallback</a></>}
  </p>;
}
