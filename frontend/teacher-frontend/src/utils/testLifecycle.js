export const getTestLifecycleStatus = (test) =>
  test.lifecycleStatus || (test.status === "draft" ? "drafted" : test.status);

const hasCapability = (test, capability) =>
  Object.prototype.hasOwnProperty.call(test, capability);

const hasTestAttempts = (test) => Boolean(
    test.hasStartedAttempts ||
    test.hasHistoricalAttempts ||
    Number(test.totalSubmissions) > 0
  );

const isEditableDraft = (test) => {
  const isLocked = Boolean(test.isManuallyLocked ?? test.isLocked);
  const hasAttempts = hasTestAttempts(test);
  return getTestLifecycleStatus(test) === "drafted" && !isLocked && !hasAttempts;
};

export const getTestLifecycleActions = (test) => {
  const canEdit = isEditableDraft(test);
  const isDrafted = getTestLifecycleStatus(test) === "drafted";
  const isLegacyDraft = test.status === "draft";
  const canLockFallback = isDrafted &&
    !Boolean(test.isManuallyLocked ?? test.isLocked) &&
    !hasTestAttempts(test);
  const canUnlockFallback = isDrafted &&
    Boolean(test.isManuallyLocked ?? test.isLocked) &&
    !hasTestAttempts(test);

  return {
    canView: test.canView !== false,
    canEdit: isLegacyDraft ? canEdit : hasCapability(test, "canEdit") ? Boolean(test.canEdit) : canEdit,
    canDelete: isLegacyDraft ? canEdit : hasCapability(test, "canDelete") ? Boolean(test.canDelete) : canEdit,
    canLock: isLegacyDraft ? canLockFallback : hasCapability(test, "canLock")
      ? Boolean(test.canLock)
      : canLockFallback,
    canUnlock: isLegacyDraft ? canUnlockFallback : hasCapability(test, "canUnlock")
      ? Boolean(test.canUnlock)
      : canUnlockFallback,
  };
};

export const getTestLifecycleBadges = (test) => {
  const status = getTestLifecycleStatus(test);
  const labels = {
    drafted: "Drafted",
    published: "Published",
    closed: "Closed",
  };
  return {
    status,
    statusLabel: labels[status] || "Unknown",
    isManuallyLocked: Boolean(test.isManuallyLocked ?? test.isLocked) && status === "drafted",
    isInUse: Boolean(test.hasStartedAttempts || test.hasHistoricalAttempts || test.totalSubmissions > 0),
    attemptCount: Number(test.totalSubmissions) || 0,
  };
};
