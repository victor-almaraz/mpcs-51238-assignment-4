"use client";
// Keeps a game's lobby current without a reload (app-flow.md, Instance lobby): it asks for the game's
// status and party every few seconds, and when the tab is shown again, and re-renders the page when
// either changed. When the game starts or resumes, a player with a character in it goes straight to play.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lobbyStateAction } from "@/lib/server/play-actions";

/** How often the lobby asks; the play page polls at the same pace. */
const POLL_MS = 4000;

export function LiveLobby({ instanceId, status, stateKey, playing }: { instanceId: string; status: string; stateKey: string; playing: boolean }) {
  const router = useRouter();
  // The state this render shows; a poll that finds another re-renders.
  const shown = useRef(stateKey);
  useEffect(() => {
    shown.current = stateKey;
  }, [stateKey]);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      const r = await lobbyStateAction(instanceId).catch(() => null);
      if (stopped || !r || r.key === shown.current) return;
      shown.current = r.key;
      // Started or resumed: a player in the party joins it; anyone else sees Enter game or the new status.
      if (r.status === "active" && status !== "active" && playing) router.push(`/instances/${instanceId}/play`);
      else router.refresh();
    };
    const t = setInterval(() => void check(), POLL_MS);
    const onShow = () => void check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [instanceId, status, playing, router]);

  return null;
}
