/**
 * 프로필 카드 — 멤버 패스 티켓 템플릿(Takumi). 본문(왼쪽)과 스텁(오른쪽)을 절취선으로 나눈 티켓 모양이에요.
 * 색은 대시보드 토큰(tokens.ts)에서 골라요 — 본문은 라이트 테마, 스텁은 브랜드 핑크예요.
 * 본문에는 아바타·이름·핸들·상태·소개·역할·날짜·스탯·음악, 스텁에는 세로로 큰 @핸들이 들어가요.
 */
import { CARD_FONT, hexToRgba, RADIUS, stripEmoji, T, W } from '@sirubot/cards';
import { BOT_NAME } from '@sirubot/utils';
import { ellipsis, LIGHT, loadImage, Pill, STATUS_COLOR, Thumb, type ProfileCardInput } from './profileCard.tsx';
import { Box, Icon, renderCardPng } from './takumiKit.tsx';

export type ProfileTicketInput = Omit<ProfileCardInput, 'variant' | 'bannerUrl'>;

export const PROFILE_TICKET_WIDTH = 920;
const STUB_W = 250;
const AVATAR = 132;

export async function renderProfileCardTicket(input: ProfileTicketInput): Promise<Buffer> {
	const theme = LIGHT;
	const tracks = input.topTracks.slice(0, 3);
	const [avatarUri, nowUri, ...trackUris] = await Promise.all([
		input.avatarUrl ? loadImage(input.avatarUrl) : null,
		input.nowPlaying?.thumbnailUrl ? loadImage(input.nowPlaying.thumbnailUrl) : null,
		...tracks.map((t) => (t.thumbnailUrl ? loadImage(t.thumbnailUrl) : null))
	]);

	const name = stripEmoji(input.displayName) || stripEmoji(input.username) || '이름 없음';
	const handle = stripEmoji(input.username);
	const intro = stripEmoji(input.intro).trim();
	const dates = (
		[
			['계정 생성', input.createdText],
			['서버 가입', input.joinedText]
		] as const
	).filter(([, value]) => value);
	const stats = [
		{ icon: 'list-music', label: '플레이리스트', value: `${input.playlistCount.toLocaleString('ko-KR')}개` },
		{ icon: 'music', label: '신청한 곡', value: `${input.requestedCount.toLocaleString('ko-KR')}곡` }
	] as const;

	const card = (
		<Box
			style={{
				width: PROFILE_TICKET_WIDTH,
				background: theme.background,
				borderRadius: RADIUS.card,
				overflow: 'hidden',
				fontFamily: CARD_FONT,
				color: theme.foreground
			}}
		>
			{/* 본문 */}
			<Box style={{ flex: 1, minWidth: 0, flexDirection: 'column', padding: 40 }}>
				<Box style={{ fontSize: 20, fontWeight: W.semibold, color: theme.muted, letterSpacing: '0.08em' }}>
					{`${handle.toUpperCase()} / MEMBER PASS`}
				</Box>
				<Box style={{ alignItems: 'center', marginTop: 22 }}>
					{avatarUri ? (
						<img src={avatarUri} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }} />
					) : (
						<Box style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, background: theme.panelInner }} />
					)}
					<Box style={{ flexDirection: 'column', marginLeft: 26, flex: 1, minWidth: 0 }}>
						<Box style={{ fontSize: 46, fontWeight: W.black, lineHeight: 1.1, color: theme.foreground, ...ellipsis }}>{name}</Box>
						<Box style={{ alignItems: 'center', marginTop: 6, minWidth: 0 }}>
							<Box style={{ fontSize: 24, color: theme.muted, minWidth: 0, ...ellipsis }}>{`@${handle}`}</Box>
							{input.guildTag ? (
								<Pill
									label={stripEmoji(input.guildTag)}
									color={theme.chipText}
									background={theme.chipBg}
									style={{ marginLeft: 12, fontSize: 20, padding: '3px 14px', flexShrink: 0 }}
								/>
							) : null}
						</Box>
						<Box style={{ alignItems: 'center', marginTop: 12 }}>
							<Box
								style={{
									alignItems: 'center',
									background: theme.panel,
									border: `2px solid ${theme.border}`,
									borderRadius: 999,
									padding: '5px 16px'
								}}
							>
								<Box style={{ width: 12, height: 12, borderRadius: 6, background: STATUS_COLOR[input.status] }} />
								<Box style={{ fontSize: 20, fontWeight: W.semibold, color: theme.foreground, marginLeft: 10 }}>
									{stripEmoji(input.statusLabel) || '온라인'}
								</Box>
							</Box>
						</Box>
					</Box>
				</Box>
				{intro ? <Box style={{ fontSize: 24, color: theme.foreground, marginTop: 18, display: 'block', lineClamp: 2 }}>{intro}</Box> : null}
				{input.roleChips.length > 0 ? (
					<Box style={{ flexWrap: 'wrap', marginTop: 18 }}>
						{input.roleChips.slice(0, 4).map((role, i) => (
							<Pill
								key={i}
								label={stripEmoji(role)}
								color={theme.chipText}
								background={theme.chipBg}
								style={{ fontSize: 20, padding: '5px 16px', marginRight: 8, marginBottom: 8, maxWidth: 300, ...ellipsis }}
							/>
						))}
					</Box>
				) : null}
				{dates.length > 0 ? (
					<Box style={{ marginTop: 14, flexWrap: 'wrap', paddingTop: 16, borderTop: `2px solid ${theme.border}` }}>
						{dates.map(([label, value]) => (
							<Box key={label} style={{ alignItems: 'center', marginRight: 28 }}>
								<Icon name="calendar" size={22} color={theme.muted} />
								<Box style={{ fontSize: 21, color: theme.muted, marginLeft: 8 }}>{label}</Box>
								<Box style={{ fontSize: 21, fontWeight: W.semibold, color: theme.foreground, marginLeft: 8 }}>{value}</Box>
							</Box>
						))}
					</Box>
				) : null}
				<Box style={{ marginTop: 16 }}>
					{stats.map((stat, i) => (
						<Box
							key={stat.label}
							style={{
								flex: 1,
								minWidth: 0,
								alignItems: 'center',
								marginLeft: i === 0 ? 0 : 12,
								background: theme.panel,
								border: `2px solid ${theme.border}`,
								borderRadius: RADIUS.control,
								padding: '12px 16px'
							}}
						>
							<Icon name={stat.icon} size={26} color={theme.accent} strokeWidth={2.2} />
							<Box style={{ flexDirection: 'column', marginLeft: 12, minWidth: 0 }}>
								<Box style={{ fontSize: 18, color: theme.muted }}>{stat.label}</Box>
								<Box style={{ fontSize: 28, fontWeight: W.black, color: theme.strong }}>{stat.value}</Box>
							</Box>
						</Box>
					))}
				</Box>
				{input.nowPlaying || tracks.length > 0 ? (
					<Box
						style={{
							flexDirection: 'column',
							marginTop: 16,
							background: theme.panel,
							border: `2px solid ${theme.border}`,
							borderRadius: RADIUS.control,
							padding: 18
						}}
					>
						{input.nowPlaying ? (
							<Box
								style={{
									alignItems: 'center',
									background: hexToRgba(theme.accent, 0.16),
									borderRadius: RADIUS.controlInner,
									padding: 10
								}}
							>
								<Thumb uri={nowUri} size={64} accent={theme.accent} />
								<Box style={{ flexDirection: 'column', marginLeft: 14, flex: 1, minWidth: 0 }}>
									<Box style={{ fontSize: 18, fontWeight: W.semibold, color: theme.strong }}>지금 재생 중</Box>
									<Box style={{ fontSize: 24, fontWeight: W.black, color: theme.foreground, ...ellipsis }}>
										{stripEmoji(input.nowPlaying.title)}
									</Box>
									<Box style={{ fontSize: 19, color: theme.muted, ...ellipsis }}>{stripEmoji(input.nowPlaying.artist)}</Box>
								</Box>
							</Box>
						) : null}
						{tracks.map((track, i) => (
							<Box key={i} style={{ alignItems: 'center', marginTop: i === 0 && !input.nowPlaying ? 0 : 12 }}>
								<Box style={{ width: 28, fontSize: 20, fontWeight: W.black, color: theme.muted }}>{String(i + 1)}</Box>
								<Thumb uri={trackUris[i] ?? null} size={44} accent={theme.accent} />
								<Box style={{ flexDirection: 'column', marginLeft: 12, flex: 1, minWidth: 0 }}>
									<Box style={{ fontSize: 22, fontWeight: W.semibold, color: theme.foreground, ...ellipsis }}>
										{stripEmoji(track.title) || '제목 없음'}
									</Box>
									<Box style={{ fontSize: 18, color: theme.muted, ...ellipsis }}>{stripEmoji(track.artist)}</Box>
								</Box>
							</Box>
						))}
					</Box>
				) : null}
			</Box>
			{/* 스텁 — 절취선(점선) + 세로 큰 핸들 */}
			<Box
				style={{
					width: STUB_W,
					flexShrink: 0,
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '36px 0',
					background: T.brand,
					color: T.brandForeground,
					borderLeft: `3px dashed ${hexToRgba(T.brandForeground, 0.4)}`
				}}
			>
				<Box style={{ fontSize: 20, fontWeight: W.black, letterSpacing: '0.12em' }}>MEMBER PASS</Box>
				<Box style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
					<Box
						style={{
							fontSize: 64,
							fontWeight: W.black,
							whiteSpace: 'nowrap',
							transform: 'rotate(-90deg)',
							width: 64,
							height: 64,
							alignItems: 'center',
							justifyContent: 'center',
							overflow: 'visible'
						}}
					>
						{`@${handle}`}
					</Box>
				</Box>
				<Box style={{ fontSize: 18, fontWeight: W.semibold }}>{BOT_NAME}</Box>
			</Box>
		</Box>
	);
	return renderCardPng(card, { width: PROFILE_TICKET_WIDTH });
}
