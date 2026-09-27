import type { SuggestedStop } from '@/lib/types';

type SuggestedStopCardProps = {
	stop: SuggestedStop;
	selected: boolean;
	onSelect: (stop: SuggestedStop) => void;
	onAddToTrip: (stop: SuggestedStop) => void;
};

export default function SuggestedStopCard({ stop, selected, onSelect, onAddToTrip }: SuggestedStopCardProps) {
	return (
		<article className={`min-w-0 overflow-hidden rounded-md border bg-white transition-colors ${selected ? 'border-[#24634d] ring-2 ring-[#24634d]/20' : 'border-[#dce5dc]'}`}>
			<button
				type="button"
				aria-pressed={selected}
				aria-label={`${stop.name}${selected ? ', selected recommendation' : ', select recommendation'}`}
				onClick={() => onSelect(stop)}
				className="block min-h-40 w-full p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e77958] sm:p-5"
			>
				<span className="flex items-center justify-between gap-3">
					<span className="eyebrow mb-0">RECOMMENDED STOP</span>
					<span className="rounded-sm bg-[#fff0cf] px-2 py-1 text-[10px] font-semibold text-[#78521b]">{stop.dataMode === 'live' ? 'LIVE' : 'DEMO'}</span>
				</span>
				<span className="mt-3 block text-base font-semibold text-[#192923]">{stop.name}</span>
				<span className="mt-1 block break-words text-xs leading-5 text-[#68766f]">{stop.address}</span>
				<span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-[#43534b]">
					<span>Rating: {stop.rating === null ? 'Unavailable' : stop.rating.toFixed(1)}</span>
					<span aria-hidden="true" className="text-[#a3ada6]">·</span>
					<span>{stop.estimatedExtraMinutes === null ? 'Extra time unknown' : `+${Math.round(stop.estimatedExtraMinutes)} min`}</span>
				</span>
				<span className="mt-3 block text-xs text-[#68766f]">Estimated spend</span>
				<span className="mt-0.5 block text-sm font-semibold text-[#192923]">
					{stop.estimatedCost === undefined ? 'Not available' : `$${stop.estimatedCost.toFixed(2)}`}
				</span>
			</button>
			<div className="border-t border-[#dce5dc] p-3">
				<button
					type="button"
					disabled={!selected}
					onClick={() => onAddToTrip(stop)}
					className={`min-h-11 w-full rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e77958] ${selected ? 'bg-[#24634d] text-white hover:bg-[#194b3a]' : 'cursor-not-allowed bg-[#edf1eb] text-[#8a958e]'}`}
				>
					Add to trip
				</button>
			</div>
		</article>
	);
}