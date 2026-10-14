'use client';

import { useState } from 'react';
import type { RideshareOption } from '@/lib/types';
import { hasRideshareProviderAction, prepareRideshareProviderAction } from '@/lib/rideshareProviderAction';
import type { RideshareNavigationEndpoints } from '@/lib/rideshareProviderAction';
import { openExternalHandoff } from '@/lib/externalHandoff';
import HandoffFallbackLinks from './HandoffFallbackLinks';

export default function RideshareProviderAction({ option, endpoints, variant = 'results', label }: {
  option: RideshareOption; endpoints?: RideshareNavigationEndpoints; variant?: 'results' | 'stranded'; label: string;
}) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [action, setAction] = useState<ReturnType<typeof prepareRideshareProviderAction> | null>(null);
  if (!hasRideshareProviderAction(option, variant, endpoints)) return null;
  function open() {
    try {
      const result = prepareRideshareProviderAction(option, endpoints, variant);
      setAction(result); setError(''); setNotice(result.notice ?? '');
      const opened = openExternalHandoff(result.url);
      if (opened.message) setError(opened.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the provider.');
    }
  }
  return <>
    <button type="button" className="rideshare-option-action" onClick={open}>{label}</button>
    {notice && <p className="field-hint" role="status">{notice}</p>}
    {action && <>
      <HandoffFallbackLinks url={action.url} webFallbackUrl={action.webFallbackUrl} />
      {action.notice && <p className="field-hint">Pickup: {action.pickupLabel ?? option.origin}. Drop-off: {action.dropoffLabel ?? option.destination}.</p>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
