'use client';

type LoadingScreenProps = {
	title: string;
	messages: readonly string[];
	action?: {
		label: string;
		onClick: () => void;
	};
};

export default function LoadingScreen({ title, messages, action }: LoadingScreenProps) {
	return (
		<section
			className="route-results relative overflow-hidden border-l-4 border-l-[#24634d] p-6 sm:p-9"
			aria-labelledby="loading-screen-title"
			aria-describedby="loading-screen-description"
			aria-busy="true"
		>
			<div className="flex flex-col gap-7 sm:flex-row sm:items-start sm:gap-8">
				<div className="planning-orb" aria-hidden="true">
					<span className="planning-orb-halo" />
					<span className="planning-orb-core" />
					<span className="planning-orb-glint" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<span className="eyebrow mb-0">ROUTEWISE</span>
						<span className="rounded-sm bg-[#edf3e9] px-2 py-1 text-[10px] font-semibold text-[#194b3a]">
							Planning
						</span>
					</div>
					<h2 id="loading-screen-title" className="font-serif text-2xl font-medium leading-tight text-[#192923] sm:text-3xl">
						{title}
					</h2>
					<p id="loading-screen-description" role="status" className="mt-2 max-w-xl text-sm leading-6 text-[#68766f]">
						Requesting live routes and comparing the available options. This may take a moment.
					</p>

					<ul className="mt-6 grid gap-3 border-t border-[#dce5dc] pt-5 sm:grid-cols-2" aria-label="Planning steps">
						{messages.map((message, index) => (
							<li key={`${message}-${index}`} className="flex min-w-0 items-center gap-3 text-sm text-[#43534b]">
								<span
									className={`size-2 shrink-0 rounded-full bg-[#24634d]/60 ${index === 0 ? 'animate-pulse motion-reduce:animate-none' : ''}`}
									aria-hidden="true"
								/>
								<span>{message}</span>
							</li>
						))}
					</ul>

					{action && (
						<div className="mt-7 flex justify-end border-t border-[#dce5dc] pt-5">
							<button className="submit-button" type="button" onClick={action.onClick}>
								<span>{action.label}</span>
								<span aria-hidden="true">↗</span>
							</button>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

