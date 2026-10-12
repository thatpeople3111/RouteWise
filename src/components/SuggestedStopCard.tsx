import type { SuggestedStop } from '@/lib/types';
import { formatDuration } from '@/lib/formatDuration';

type SuggestedStopCardProps = {
	stop: SuggestedStop;
	/** Kept for visual parity when a selection exists; not required to add. */
	selected?: boolean;
	onSelect?: (stop: SuggestedStop) => void;
	/** One-click: immediately adds this stop and continues planning. */
	onAddToTrip: (stop: SuggestedStop) => void;
	busy?: boolean;
};

export default function SuggestedStopCard({ stop, onAddToTrip, busy = false }: SuggestedStopCardProps) {
	return (
		<article className="min-w-0 overflow-hidden rounded-md border border-[#dce5dc] bg-white transition-colors">
			<div className="block min-h-40 w-full p-4 text-left sm:p-5">
				<span className="flex items-center justify-between gap-3">
					<span className="eyebrow mb-0">RECOMMENDED STOP</span>
					<span className="rounded-sm bg-[#fff0cf] px-2 py-1 text-[10px] font-semibold text-[#78521b]">{stop.dataMode === 'live' ? 'LIVE' : 'DEMO'}</span>
				</span>
				<span className="mt-3 block text-base font-semibold text-[#192923]">{stop.name}</span>
				<span className="mt-1 block break-words text-xs leading-5 text-[#68766f]">{stop.address}</span>
				<span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#43534b]">
					<span>Rating: {stop.rating === null ? 'Unavailable' : stop.rating.toFixed(1)}</span>
					<span aria-hidden="true" className="text-[#a3ada6]">·</span>
					<span>{stop.estimatedExtraMinutes === null ? 'Extra time unknown' : `+${formatDuration(stop.estimatedExtraMinutes)}`}</span>
				</span>
				<span className="mt-3 block text-xs text-[#68766f]">Estimated spend</span>
				<span className="mt-0.5 block text-sm font-semibold text-[#192923]">
					{stop.estimatedCost === undefined ? 'Not available' : `$${stop.estimatedCost.toFixed(2)}`}
				</span>
			</div>
			<div className="border-t border-[#dce5dc] p-3">
				<button
					type="button"
					disabled={busy}
					onClick={() => onAddToTrip(stop)}
					className="min-h-11 w-full rounded-md bg-[#24634d] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#194b3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e77958] disabled:cursor-wait disabled:opacity-60"
				>
					Add to trip
				</button>
			</div>
		</article>
	);
}