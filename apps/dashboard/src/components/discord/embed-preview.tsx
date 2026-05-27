import Image from "next/image";

/* ─────────────────────────── types ─────────────────────────── */

export interface EmbedField {
	name: string;
	value: string;
	inline?: boolean;
}

export interface EmbedAuthor {
	name: string;
	iconUrl?: string;
	url?: string;
}

export interface EmbedFooter {
	text: string;
	iconUrl?: string;
	timestamp?: string;
}

export interface EmbedData {
	color?: string;
	author?: EmbedAuthor;
	title?: string;
	titleUrl?: string;
	description?: string;
	fields?: EmbedField[];
	image?: string;
	thumbnail?: string;
	footer?: EmbedFooter;
}

interface EmbedPreviewProps {
	embed: EmbedData;
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function EmbedPreview({ embed, className = "" }: EmbedPreviewProps) {
	return (
		<div
			className={`flex max-w-[520px] bg-discord-embed rounded-md overflow-hidden ${className}`}
		>
			{/* Left color bar */}
			<div
				className="w-1 shrink-0 rounded-l-md"
				style={{ backgroundColor: embed.color ?? "#5865F2" }}
			/>

			{/* Content */}
			<div className="flex-1 p-3 min-w-0">
				<div className="flex gap-4">
					<div className="flex-1 min-w-0 space-y-2">
						{/* Author */}
						{embed.author && (
							<div className="flex items-center gap-2">
								{embed.author.iconUrl && (
									<Image
										src={embed.author.iconUrl}
										alt=""
										width={24}
										height={24}
										className="rounded-full"
									/>
								)}
								{embed.author.url ? (
									<a
										href={embed.author.url}
										className="text-xs font-semibold text-discord-text hover:underline"
									>
										{embed.author.name}
									</a>
								) : (
									<span className="text-xs font-semibold text-discord-text">
										{embed.author.name}
									</span>
								)}
							</div>
						)}

						{/* Title */}
						{embed.title && (
							<div>
								{embed.titleUrl ? (
									<a
										href={embed.titleUrl}
										className="text-sm font-bold text-discord-blue hover:underline leading-snug"
									>
										{embed.title}
									</a>
								) : (
									<p className="text-sm font-bold text-discord-text leading-snug">
										{embed.title}
									</p>
								)}
							</div>
						)}

						{/* Description */}
						{embed.description && (
							<p className="text-sm text-discord-text leading-relaxed whitespace-pre-wrap">
								{embed.description}
							</p>
						)}

						{/* Fields */}
						{embed.fields && embed.fields.length > 0 && (
							<div className="grid gap-2 mt-1" style={{
								gridTemplateColumns: embed.fields.some(f => f.inline)
									? "repeat(3, 1fr)"
									: "1fr",
							}}>
								{embed.fields.map((field, i) => (
									<div
										key={i}
										className={field.inline ? "" : "col-span-full"}
									>
										<p className="text-xs font-bold text-discord-text mb-0.5">
											{field.name}
										</p>
										<p className="text-sm text-discord-text-muted whitespace-pre-wrap">
											{field.value}
										</p>
									</div>
								))}
							</div>
						)}

						{/* Image */}
						{embed.image && (
							<div className="mt-2">
								<Image
									src={embed.image}
									alt=""
									width={400}
									height={225}
									className="rounded-md max-w-full h-auto"
								/>
							</div>
						)}
					</div>

					{/* Thumbnail */}
					{embed.thumbnail && (
						<div className="shrink-0">
							<Image
								src={embed.thumbnail}
								alt=""
								width={80}
								height={80}
								className="rounded-md"
							/>
						</div>
					)}
				</div>

				{/* Footer */}
				{embed.footer && (
					<div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
						{embed.footer.iconUrl && (
							<Image
								src={embed.footer.iconUrl}
								alt=""
								width={20}
								height={20}
								className="rounded-full"
							/>
						)}
						<span className="text-xs text-discord-text-muted">
							{embed.footer.text}
							{embed.footer.timestamp && (
								<>
									{" • "}
									{embed.footer.timestamp}
								</>
							)}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
