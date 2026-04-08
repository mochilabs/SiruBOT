# UX and Accessibility Patterns for SiruBOT Dashboard

## 1. Real-time Music Playback Sync (Interpolation)
Due to the frequency of updates required for the "current playback time" of music, we prioritize network efficiency and client-side performance:
- **Strategy:** Instead of polling the server every second for the current time, the backend provides the `startTime` (Timestamp) and the total `duration` via events (Redis Pub/Sub -> WebSocket).
- **Client-Side:** The frontend calculates the current progress locally using an interpolation method. Using `requestAnimationFrame` or `setInterval` combined with the `startTime`, the progress bar updates smoothly without constant server pinging.

## 2. Optimistic UI
For music controls (e.g., Play, Pause, Skip), user experience should feel instantaneous:
- **Strategy:** When a user initiates a control action, the UI state (e.g., button icon, current song display) updates **immediately**.
- **Execution:** Behind the scenes, the network request is sent. If the request fails, the UI state is gracefully rolled back, and an error notification is presented to the user.

## 3. Error Handling (Toast Notifications)
Robust communication of system status and connection integrity:
- **Strategy:** If the bot disconnects from the voice channel or the WebSocket/Redis connection is lost, users must be informed immediately.
- **Execution:** Implement Toast notifications to display crucial alerts (e.g., "봇이 연결되지 않음") prominently without completely disrupting the interface layout.

## 4. Skeleton UI (Loading States)
Prevent layout shift and improve perceived performance during initial data fetches:
- **Strategy:** When users enter the dashboard, the queue data may take time to load from Redis.
- **Execution:** Use Skeleton UI components that mimic the shape and layout of the eventual content (e.g., song lists, player controls) to maintain structural stability while the data is loading.
