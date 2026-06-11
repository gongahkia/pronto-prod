"use client";

import dynamic from "next/dynamic";

export const AssistantDockLoader = dynamic(
  () => import("@/components/assistant-dock").then((mod) => mod.AssistantDock),
  { ssr: false },
);
