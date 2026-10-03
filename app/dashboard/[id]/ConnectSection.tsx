"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JoinCodeBox from "./JoinCodeBox";
import ConnectPrompt from "./ConnectPrompt";

/**
 * Owns the join-code state so regenerating the code updates both the code box
 * and the agent prompt below it.
 */
export default function ConnectSection({
  workspaceId,
  initialCode,
  expiresAt,
  appUrl,
  username,
  workspaceName,
  active,
}: {
  workspaceId: string;
  initialCode: string;
  expiresAt: string;
  appUrl: string;
  username: string;
  workspaceName: string;
  /** False for finalized workspaces — their join codes never auto-regenerate. */
  active: boolean;
}) {
  const [code, setCode] = useState(initialCode);
  const [expires, setExpires] = useState(expiresAt);
  const codeRef = useRef(initialCode);

  const applyCode = useCallback((newCode: string, newExpires: string) => {
    codeRef.current = newCode;
    setCode(newCode);
    setExpires(newExpires);
  }, []);

  // Join codes are single-use: the server rotates the code every time an agent
  // joins. Poll so the dashboard never shows a stale, dead code. This reuses
  // the same state as manual/auto regeneration, so the prompt follows along.
  // The agent-name field lives in ConnectPrompt's own state — untouched here.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function sync() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/join-code`, {
          credentials: "same-origin",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          join_code?: string;
          join_code_expires_at?: string;
        };
        if (json.join_code && json.join_code !== codeRef.current) {
          applyCode(json.join_code, json.join_code_expires_at ?? "");
        }
      } catch {
        /* transient network hiccup — next poll retries */
      }
    }
    sync();
    const t = setInterval(sync, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active, workspaceId, applyCode]);

  return (
    <>
      <JoinCodeBox
        workspaceId={workspaceId}
        code={code}
        expires={expires}
        autoRegenerate={active}
        onRegenerated={(newCode, newExpires) => {
          applyCode(newCode, newExpires);
        }}
      />
      <ConnectPrompt
        appUrl={appUrl}
        joinCode={code}
        username={username}
        workspaceName={workspaceName}
      />
    </>
  );
}
