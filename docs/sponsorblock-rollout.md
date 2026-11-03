# SponsorBlock and YouTube.js rollout

The data-api owns SponsorBlock and YouTube lookups. BOT selects the guild's enabled skip categories, seeks the current main player, and sends a leading skip end to the mixer for the incoming secondary player. The Lavalink SponsorBlock plugin is no longer needed.

## Contract

- `GET /v1/sponsorblock/segments?videoId=<11-character YouTube ID>` returns `{segments:[{category,startMs,endMs}],_cached,stale}`. Positions are integer milliseconds. The response includes only SponsorBlock `skip` actions. Empty results are cached for one hour, positive results for 24 hours, and positive stale results for seven days on upstream failure.
- BOT prefetches the next track's segments when the queue head changes. When an arm event arrives, it computes the end of selected skip segments that touch the start of the track and sends `startPositionMs` in `POST /mixer/queue/arm`. It sends the field only when `/mixer/info` says `incomingStartPositionSupported: true`.
- BOT skips selected middle segments with `player.seek`. For an outro reaching the end of the current track, BOT sends its start as `outgoingEndPositionMs` when `/mixer/info` advertises `outgoingEndPositionSupported`. The mixer finishes its fade at that point. BOT does not seek while overlap is active or across an outgoing crossfade boundary. A new track discards its predecessor's pending lookup. If an outro cutoff is already too close when the arm arrives, the field is omitted and the ordinary crossfade runs.
- `GET /v1/chapters?videoId=&durationMs=` gets markers through YouTube.js, including short videos. `GET /v1/youtube/suggestions?q=` replaces the BOT's JSONP autocomplete parser.

## Deployment

1. Install the new `lavalink_mixer` JAR and restart Lavalink. Check `/mixer/info` for `incomingStartPositionSupported: true` and `outgoingEndPositionSupported: true`.
2. Deploy data-api and confirm both `/v1/sponsorblock/segments` and `/v1/chapters` through an authenticated request.
3. Deploy BOT. Remove the old Lavalink SponsorBlock plugin JAR on the next Lavalink restart. BOT clears any plugin categories restored in an existing session during the transition.

The local tests verify protocol, cache handling, and seek decisions. A live Discord voice session is still needed to verify audible handoff and plugin removal.
