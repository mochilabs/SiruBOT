"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { Track as TrackType } from "@sirubot/prisma";
import { Heart } from "lucide-react";
import { motion } from "framer-motion";

import Container from "@/components/container";
import Loader from "@/components/loader";
import { SearchInput } from "@/components/search-input";
import { TrackList } from "@/components/track";

export default function FavoritesPage() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("query") || "";

  const { data, error, isLoading } = useSWR<{ tracks: TrackType[] }>(
    status === "authenticated" ? "/api/favorites" : null,
  );

  const allTracks = data?.tracks ?? [];

  const filteredTracks = useMemo(() => {
    if (!query) return allTracks;
    const q = query.toLowerCase();
    return allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
    );
  }, [allTracks, query]);

  if (status === "loading") {
    return (
      <Container>
        <Loader fullPage />
      </Container>
    );
  }

  if (status === "unauthenticated") {
    router.push("/api/auth/signin?callbackUrl=/favorites");
    return null;
  }

  if (error) {
    return (
      <Container>
        <div className="glass-panel p-20 text-center border-red-500/20 shadow-xl">
          <p className="text-xl font-medium text-red-400">
            즐겨찾기를 불러오지 못했어요.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-primary font-bold"
          >
            새로고침
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <header className="mb-4 sm:mb-8 space-y-4 sm:space-y-4 pb-4 sm:pb-8 border-b border-border/40 relative">
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/20 text-primary text-sm font-bold shadow-sm shadow-primary/5"
          >
            <Heart size={16} />
            <span className="tracking-tight">즐겨찾기</span>
          </motion.div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4">
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="text-5xl md:text-6xl font-black tracking-tighter text-title-gradient leading-[0.9] py-1"
              >
                즐겨찾는 노래들
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="text-xl font-medium text-muted-foreground/80 leading-relaxed max-w-2xl"
              >
                즐겨찾는 노래를 여기서 한눈에 모아보세요.
              </motion.p>
            </div>
          </div>
        </div>

        <div className="max-w-full flex sm:flex-row gap-4 sm:gap-6 lg:items-center">
          <SearchInput
            placeholder="즐겨찾기에서 검색..."
            basePath="/favorites"
            className="flex-1"
          />
          <div className="flex gap-2 sm:gap-3 justify-start md:justify-end h-12 sm:h-14">
            <div className="group relative glass-panel h-full px-6 flex flex-col justify-center items-center border-border/50 hover:border-primary/20 transition-colors cursor-help flex-1 md:flex-none md:min-w-[140px]">
              <div className="flex items-center gap-1.5 text-primary/60">
                <span className="text-[10px] font-black tracking-widest uppercase text-center">
                  즐겨찾는 노래 수
                </span>
              </div>
              <span className="text-xl font-black text-foreground leading-[1.1] tabular-nums">
                {isLoading ? "---" : allTracks.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-6 min-h-[500px] relative">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0"
          >
            <Loader text="즐겨찾기를 불러오는 중..." />
          </motion.div>
        ) : allTracks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-20 text-center border-dashed border-border/50 shadow-sm"
          >
            <p className="text-xl font-medium text-muted-foreground">
              즐겨찾는 노래 추가하기
            </p>
          </motion.div>
        ) : filteredTracks.length === 0 ? (
          <motion.div
            key="no-result"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-20 text-center border-dashed border-border/50 shadow-sm"
          >
            <p className="text-xl font-medium text-muted-foreground">
              &apos;{query}&apos;에 해당하는 노래를 찾을 수 없어요.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <TrackList tracks={filteredTracks} />
          </motion.div>
        )}
      </section>
    </Container>
  );
}
