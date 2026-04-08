export function mergeTradeWorkspaceState(prev, patch) {
  return {
    partnerTeamId: patch?.partnerTeamId ?? prev?.partnerTeamId ?? null,
    outgoingPlayerIds: Array.isArray(patch?.outgoingPlayerIds) ? patch.outgoingPlayerIds : (prev?.outgoingPlayerIds ?? []),
    outgoingPickIds: Array.isArray(patch?.outgoingPickIds) ? patch.outgoingPickIds : (prev?.outgoingPickIds ?? []),
    incomingPlayerIds: Array.isArray(patch?.incomingPlayerIds) ? patch.incomingPlayerIds : (prev?.incomingPlayerIds ?? []),
    helperReason: patch?.helperReason ?? prev?.helperReason ?? '',
    helperContext: patch?.helperContext ?? prev?.helperContext ?? null,
  };
}

export function toBuilderSeed(workspace) {
  return {
    partnerTeamId: workspace?.partnerTeamId ?? null,
    outgoingPlayerIds: workspace?.outgoingPlayerIds ?? [],
    outgoingPickIds: workspace?.outgoingPickIds ?? [],
  };
}
