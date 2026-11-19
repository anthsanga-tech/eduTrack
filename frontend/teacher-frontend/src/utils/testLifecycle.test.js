import { test, expect } from "vitest";
import {
  getTestStatusChoices,
  getTestLifecycleActions,
  getTestLifecycleBadges,
  getTestLifecycleStatus,
} from "./testLifecycle.js";

test("status choices allow only lifecycle-safe transitions", () => {
  expect(getTestStatusChoices("drafted", { canPublish: true })).toEqual([
    { value: "drafted", label: "Draft", disabled: false },
    { value: "published", label: "Published", disabled: false },
    { value: "closed", label: "Closed", disabled: true },
  ]);
  expect(getTestStatusChoices("published", { canClose: false })).toEqual([
    { value: "drafted", label: "Draft", disabled: true },
    { value: "published", label: "Published", disabled: false },
    { value: "closed", label: "Closed", disabled: true },
  ]);
  expect(getTestStatusChoices("published", { canClose: true }).map(choice => choice.disabled)).toEqual([
    true, false, false,
  ]);
  expect(getTestStatusChoices("closed").map(choice => choice.disabled)).toEqual([
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
  expect(actions).toEqual({
    canView: true,
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  });
  expect(getTestLifecycleBadges({ status: "drafted" }).statusLabel).toBe("Drafted");
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
  expect(getTestLifecycleBadges(test).isManuallyLocked).toBe(true);
  expect(getTestLifecycleActions(test).canUnlock).toBe(true);
  expect(getTestLifecycleActions(test).canEdit).toBe(false);
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
    expect(badges.statusLabel).toBe(status === "published" ? "Published" : "Closed");
    expect(badges.isInUse).toBe(true);
    expect(actions.canEdit).toBe(false);
    expect(actions.canDelete).toBe(false);
    expect(actions.canLock).toBe(false);
    expect(actions.canUnlock).toBe(false);
  }
});

test("legacy draft status is presented as drafted until migration has run", () => {
  expect(getTestLifecycleStatus({ status: "draft" })).toBe("drafted");
});

test("legacy draft tests without lifecycle capabilities remain editable and manageable", () => {
  const actions = getTestLifecycleActions({
    status: "draft",
    isLocked: false,
    totalSubmissions: 0,
  });

  expect(actions.canEdit).toBe(true);
  expect(actions.canDelete).toBe(true);
  expect(actions.canLock).toBe(true);
  expect(actions.canUnlock).toBe(false);
});

test("legacy draft fallback respects locks and records while preserving backend permissions otherwise", () => {
  expect(getTestLifecycleActions({
    status: "draft",
    isLocked: true,
    totalSubmissions: 0,
  }).canEdit).toBe(false);
  expect(getTestLifecycleActions({
    status: "draft",
    isLocked: false,
    totalSubmissions: 2,
  }).canEdit).toBe(false);
  expect(getTestLifecycleActions({
    status: "draft",
    isLocked: false,
    totalSubmissions: 0,
    canEdit: false,
  }).canEdit).toBe(true);
});
