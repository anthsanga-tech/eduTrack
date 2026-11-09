import assert from "node:assert/strict";
import test from "node:test";
import {
  getTestStatusChoices,
  getTestLifecycleActions,
  getTestLifecycleBadges,
  getTestLifecycleStatus,
} from "./testLifecycle.js";

test("status choices allow only lifecycle-safe transitions", () => {
  assert.deepEqual(getTestStatusChoices("drafted", { canPublish: true }), [
    { value: "drafted", label: "Draft", disabled: false },
    { value: "published", label: "Published", disabled: false },
    { value: "closed", label: "Closed", disabled: true },
  ]);
  assert.deepEqual(getTestStatusChoices("published", { canClose: false }), [
    { value: "drafted", label: "Draft", disabled: true },
    { value: "published", label: "Published", disabled: false },
    { value: "closed", label: "Closed", disabled: true },
  ]);
  assert.deepEqual(getTestStatusChoices("published", { canClose: true }).map(choice => choice.disabled), [
    true, false, false,
  ]);
  assert.deepEqual(getTestStatusChoices("closed").map(choice => choice.disabled), [
    true, true, false,
  ]);
});

test("drafted unlocked tests expose only backend-approved management actions", () => {
  const actions = getTestLifecycleActions({
    canView: true,
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  });
  assert.deepEqual(actions, {
    canView: true,
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  });
  assert.equal(getTestLifecycleBadges({ status: "drafted" }).statusLabel, "Drafted");
});

test("drafted locked tests show a separate lock badge and only permit unlocking", () => {
  const test = {
    status: "drafted",
    isLocked: true,
    canEdit: false,
    canDelete: false,
    canLock: false,
    canUnlock: true,
  };
  assert.equal(getTestLifecycleBadges(test).isManuallyLocked, true);
  assert.equal(getTestLifecycleActions(test).canUnlock, true);
  assert.equal(getTestLifecycleActions(test).canEdit, false);
});

test("published and closed tests remain view-only regardless of attempt count", () => {
  for (const status of ["published", "closed"]) {
    const test = {
      status,
      canView: true,
      canEdit: false,
      canDelete: false,
      canLock: false,
      canUnlock: false,
      totalSubmissions: 3,
      hasHistoricalAttempts: true,
    };
    const badges = getTestLifecycleBadges(test);
    const actions = getTestLifecycleActions(test);
    assert.equal(badges.statusLabel, status === "published" ? "Published" : "Closed");
    assert.equal(badges.isInUse, true);
    assert.equal(actions.canEdit, false);
    assert.equal(actions.canDelete, false);
    assert.equal(actions.canLock, false);
    assert.equal(actions.canUnlock, false);
  }
});

test("legacy draft status is presented as drafted until migration has run", () => {
  assert.equal(getTestLifecycleStatus({ status: "draft" }), "drafted");
});

test("legacy draft tests without lifecycle capabilities remain editable and manageable", () => {
  const actions = getTestLifecycleActions({
    status: "draft",
    isLocked: false,
    totalSubmissions: 0,
  });

  assert.equal(actions.canEdit, true);
  assert.equal(actions.canDelete, true);
  assert.equal(actions.canLock, true);
  assert.equal(actions.canUnlock, false);
});

test("legacy draft fallback respects locks and records while preserving backend permissions otherwise", () => {
  assert.equal(getTestLifecycleActions({
    status: "draft",
    isLocked: true,
    totalSubmissions: 0,
  }).canEdit, false);
  assert.equal(getTestLifecycleActions({
    status: "draft",
    isLocked: false,
    totalSubmissions: 2,
  }).canEdit, false);
  assert.equal(getTestLifecycleActions({
    status: "draft",
    isLocked: false,
    totalSubmissions: 0,
    canEdit: false,
  }).canEdit, true);
});
