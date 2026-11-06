const protectionBadges = [
  ["isSystemProtected", "System protected", "is-system"],
  ["isInUse", "In use · Protected", "is-protected"],
  ["isManuallyLocked", "Manually locked", "is-locked"],
];

export const getQuestionProtectionBadges = (question) => {
  const activeBadges = protectionBadges
    .filter(([state]) => question[state])
    .map(([, label, className]) => ({ label, className }));

  return activeBadges.length ? activeBadges : [{ label: "Available", className: "" }];
};

export const getQuestionProtectionActions = (question) => ({
  canEdit: Boolean(question.canEdit),
  canDelete: Boolean(question.canDelete),
  canLock: Boolean(question.canLock),
  canUnlock: Boolean(question.canUnlock),
});
