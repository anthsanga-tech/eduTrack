import { test, expect } from "vitest";
import {
  getQuestionProtectionActions,
  getQuestionProtectionBadges,
} from "./questionProtection.js";

test("available questions show no protection type and use backend capabilities", () => {
  expect(getQuestionProtectionBadges({})).toEqual([
    { label: "Available", className: "" },
  ]);
  expect(getQuestionProtectionActions({
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  })).toEqual({
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  });
});

test("system, usage, and manual locks render separately", () => {
  expect(getQuestionProtectionBadges({
    isSystemProtected: true,
  })).toEqual([{ label: "System protected", className: "is-system" }]);
  expect(getQuestionProtectionBadges({
    isManuallyLocked: true,
  })).toEqual([{ label: "Manually locked", className: "is-locked" }]);
  expect(getQuestionProtectionBadges({
    isInUse: true,
    isManuallyLocked: true,
  })).toEqual([
    { label: "In use · Protected", className: "is-protected" },
    { label: "Manually locked", className: "is-locked" },
  ]);
});

test("usage-protection actions come from backend permissions", () => {
  expect(getQuestionProtectionActions({
    canEdit: false,
    canDelete: false,
    canLock: false,
    canUnlock: false,
  })).toEqual({
    canEdit: false,
    canDelete: false,
    canLock: false,
    canUnlock: false,
  });
});
