"use client";

import { useState } from "react";
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

  return (
    <>
      <JoinCodeBox
        workspaceId={workspaceId}
        code={code}
        expires={expires}
        autoRegenerate={active}
        onRegenerated={(newCode, newExpires) => {
          setCode(newCode);
          setExpires(newExpires);
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
