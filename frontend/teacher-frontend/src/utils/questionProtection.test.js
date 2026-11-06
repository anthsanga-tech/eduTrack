import assert from "node:assert/strict";
import test from "node:test";
import {
  getQuestionProtectionActions,
  getQuestionProtectionBadges,
} from "./questionProtection.js";

test("available questions show no protection type and use backend capabilities", () => {
  assert.deepEqual(getQuestionProtectionBadges({}), [
    { label: "Available", className: "" },
  ]);
  assert.deepEqual(getQuestionProtectionActions({
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  }), {
    canEdit: true,
    canDelete: true,
    canLock: true,
    canUnlock: false,
  });
});

test("system, usage, and manual locks render separately", () => {
  assert.deepEqual(getQuestionProtectionBadges({
    isSystemProtected: true,
  }), [{ label: "System protected", className: "is-system" }]);
  assert.deepEqual(getQuestionProtectionBadges({
    isManuallyLocked: true,
  }), [{ label: "Manually locked", className: "is-locked" }]);
  assert.deepEqual(getQuestionProtectionBadges({
    isInUse: true,
    isManuallyLocked: true,
  }), [
    { label: "In use · Protected", className: "is-protected" },
    { label: "Manually locked", className: "is-locked" },
  ]);
});

test("usage-protection actions come from backend permissions", () => {
  assert.deepEqual(getQuestionProtectionActions({
    canEdit: false,
    canDelete: false,
    canLock: false,
    canUnlock: false,
  }), {
    canEdit: false,
    canDelete: false,
    canLock: false,
    canUnlock: false,
  });
});
