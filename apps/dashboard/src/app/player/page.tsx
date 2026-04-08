"use client";

import { useState, useEffect, useRef } from "react";
import { Container, Card, Text, Flex, Button, Skeleton, Box, Heading, Callout } from "@radix-ui/themes";

// --- Mock Data ---
const MOCK_SONGS = [
  { id: "1", title: "Cyberpunk City Nights", artist: "Synthwave Master", duration: 180000 }, // 3 mins
  { id: "2", title: "Lo-Fi Study Beats", artist: "Chill Girl", duration: 240000 }, // 4 mins
  { id: "3", title: "Epic Orchestral Trailer", artist: "Hans Zimmer Wannabe", duration: 150000 }, // 2.5 mins
];

export default function PlayerPrototype() {
  // Application State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player State
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Real-time Sync State (Interpolation)
  const [startTime, setStartTime] = useState<number | null>(null);
  const [progress, setProgress] = useState(0); // in milliseconds

  const requestRef = useRef<number>(null);

  // 1. Skeleton UI: Simulate initial data fetching delay
  useEffect(() => {
    const fetchInitialData = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setLoading(false);
      setStartTime(Date.now());
    };
    fetchInitialData();
  }, []);

  // 2. Real-time Interpolation: Smooth progress bar without polling
  useEffect(() => {
    if (loading || !startTime) return;

    const animate = () => {
      if (isPlaying) {
        // Calculate progress dynamically based on current time
        const now = Date.now();
        const elapsedTime = now - startTime;
        setProgress(elapsedTime);
      }

      // Loop
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, startTime, loading]);

  // Handle Play/Pause with Optimistic UI
  const handlePlayPause = async () => {
    // Optimistic Update: Immediately toggle UI
    const nextIsPlaying = !isPlaying;
    setIsPlaying(nextIsPlaying);

    if (nextIsPlaying) {
      // Resuming: Calculate a new simulated start time to match progress
      setStartTime(Date.now() - progress);
    }

    try {
      // Simulate network request
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate a 10% chance of failure to demonstrate error handling
          if (Math.random() < 0.1) reject(new Error("Network connection failed"));
          resolve(true);
        }, 500);
      });
    } catch {
      // Revert Optimistic Update
      setIsPlaying(!nextIsPlaying);
      setError("명령을 전송하는 데 실패했습니다. 다시 시도해주세요.");
      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle Skip with Optimistic UI
  const handleSkip = async () => {
    const previousIndex = currentSongIndex;
    const previousStartTime = startTime;

    // Optimistic Update: Jump to next song immediately
    const nextIndex = (currentSongIndex + 1) % MOCK_SONGS.length;
    setCurrentSongIndex(nextIndex);
    setProgress(0);
    setStartTime(Date.now());
    setIsPlaying(true);

    try {
      // Simulate network request
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < 0.1) reject(new Error("Network timeout"));
          resolve(true);
        }, 300);
      });
    } catch {
      // Revert Optimistic Update
      setCurrentSongIndex(previousIndex);
      setStartTime(previousStartTime);
      setError("다음 곡으로 넘어가지 못했습니다.");
      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle Simulated Disconnect
  const simulateDisconnect = () => {
    setError("봇이 연결되지 않음: Redis 연결이 끊어졌습니다.");
    setIsPlaying(false);
  };

  const currentSong = MOCK_SONGS[currentSongIndex];

  // Ensure progress doesn't exceed duration (and handle auto-skip logic)
  useEffect(() => {
    if (progress >= currentSong.duration) {
      // We handle skip without adding the entire handleSkip function to dependencies to avoid re-renders
      const nextIndex = (currentSongIndex + 1) % MOCK_SONGS.length;
      setCurrentSongIndex(nextIndex);
      setProgress(0);
      setStartTime(Date.now());
      setIsPlaying(true);
    }
  }, [progress, currentSong.duration, currentSongIndex]);

  // Format ms to mm:ss
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPercentage = Math.min((progress / currentSong.duration) * 100, 100);

  return (
    <Container size="2" mt="8">
      <Heading mb="4" align="center">Music Player Prototype</Heading>

      {/* 3. Error Handling (Toast equivalent) */}
      {error && (
        <Box mb="4">
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        </Box>
      )}

      <Card size="4">
        {loading ? (
          // 4. Skeleton UI
          <Flex direction="column" gap="4">
            <Skeleton height="20px" width="60%" />
            <Skeleton height="15px" width="40%" />
            <Box mt="4">
              <Skeleton height="8px" width="100%" />
            </Box>
            <Flex justify="center" gap="4" mt="4">
              <Skeleton height="40px" width="40px" />
              <Skeleton height="40px" width="40px" />
              <Skeleton height="40px" width="40px" />
            </Flex>
          </Flex>
        ) : (
          // Loaded UI
          <Flex direction="column" gap="4">
            <Box>
              <Text as="div" size="5" weight="bold" truncate>
                {currentSong.title}
              </Text>
              <Text as="div" size="3" color="gray" truncate>
                {currentSong.artist}
              </Text>
            </Box>

            {/* Progress Bar (Interpolated) */}
            <Box>
              <Box
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: 'var(--gray-a4)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}
              >
                <Box
                  style={{
                    width: `${progressPercentage}%`,
                    height: '100%',
                    backgroundColor: 'var(--accent-9)',
                    transition: isPlaying ? 'none' : 'width 0.2s ease', // Smooth transition only when paused
                  }}
                />
              </Box>
              <Flex justify="between" mt="2">
                <Text size="2" color="gray">{formatTime(progress)}</Text>
                <Text size="2" color="gray">{formatTime(currentSong.duration)}</Text>
              </Flex>
            </Box>

            {/* Controls */}
            <Flex justify="center" align="center" gap="4" mt="2">
              <Button variant="soft" onClick={() => {}} disabled>
                Prev
              </Button>

              <Button
                size="3"
                variant="solid"
                onClick={handlePlayPause}
                style={{ width: '80px' }}
              >
                {isPlaying ? "Pause" : "Play"}
              </Button>

              <Button variant="soft" onClick={handleSkip}>
                Skip
              </Button>
            </Flex>

            {/* Test Actions */}
            <Flex justify="center" mt="4">
               <Button size="1" color="red" variant="outline" onClick={simulateDisconnect}>
                 Simulate Disconnect Error
               </Button>
            </Flex>

          </Flex>
        )}
      </Card>

      <Box mt="8">
        <Text size="2" color="gray" as="div">
          <strong>Prototype Features:</strong>
          <ul>
            <li><strong>Skeleton UI:</strong> Initial 2s load time.</li>
            <li><strong>Real-time Sync:</strong> Progress bar updates locally via `requestAnimationFrame`.</li>
            <li><strong>Optimistic UI:</strong> Buttons trigger UI state change immediately before network resolves. (10% chance of failure simulated).</li>
            <li><strong>Error Handling:</strong> Errors (simulated disconnects) show up immediately.</li>
          </ul>
        </Text>
      </Box>
    </Container>
  );
}
