'use client';

type HomeScreenProps = {
	onGetStarted: () => void;
	onStranded: () => void;
};

export default function HomeScreen({ onGetStarted, onStranded }: HomeScreenProps) {
	return (
		<section className="home-screen" aria-labelledby="home-title">
			<div className="home-hero">
				<span className="eyebrow">ROUTEWISE</span>
				<h1 id="home-title" className="home-title">Smarter trips, built around you.</h1>
				<p className="home-copy">
					Plan the best way to get where you&apos;re going based on time, budget,
					transportation, walking preferences, and more.
				</p>
			</div>

			<button className="home-stranded" type="button" onClick={onStranded}>
				<span className="home-stranded-mark" aria-hidden="true">!</span>
				<span className="home-stranded-text">
					<span className="home-stranded-kicker">NEED HELP GETTING HOME?</span>
					<span className="home-stranded-label">I&apos;m stranded</span>
				</span>
				<span aria-hidden="true">↗</span>
			</button>

			<button className="submit-button home-get-started" type="button" onClick={onGetStarted}>
				<span>Let&apos;s get started</span>
				<span aria-hidden="true">↗</span>
			</button>
		</section>
	);
}
