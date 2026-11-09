import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { requireRole } from "../middleware/roleMiddleware.js";
import Question from "../models/Question.js";
import Submission from "../models/Submission.js";
import TestModel from "../models/Test.js";
import User from "../models/User.js";
import teacherRoutes from "../routes/teacherRoutes.js";
import {
    closeTest,
    deleteQuestion,
    deleteTest,
    getAccessibleQuestions,
    publishTest,
    updateQuestion,
    updateTest,
} from "../controllers/teacherController.js";
import { getCreateAttemptID } from "../controllers/studentController.js";
import {
    canDelete,
    canCloseTest,
    canEdit,
    canEditTest,
    canLock,
    canLockTest,
    canPublishTest,
    canUnlockTest,
    canDeleteTest,
    canUnlock,
    createAttemptSnapshot,
    getQuestionDeleteProtectionReason,
    getManualLockUpdate,
    getQuestionAttemptState,
    getQuestionProtectionState,
    getQuestionProtectionReason,
    getTestProtectionReason,
    getTestLifecycleState,
    getTestPublicationValidationError,
    gradeAttemptAnswers,
    getDifficultyQuery,
    isQuestionDifficultyCompatible,
    isOwnedBy,
    isInUse,
    isManuallyLocked,
    normalizeDifficulty,
    isProtected,
    isSystemProtected,
} from "./resourceProtection.js";
import {
    lockQuestion,
    lockTest,
    unlockQuestion,
    unlockTest,
} from "../controllers/resourceLockController.js";

const now = new Date("2026-11-05T00:00:00.000Z");
const ownerId = "teacher-1";
const otherTeacherId = "teacher-2";
const testId = "507f1f77bcf86cd799439011";
const questionId = "507f1f77bcf86cd799439012";
const ownedTest = { teacher: ownerId, status: "draft", isLocked: false };
const ownedQuestion = { createdBy: ownerId, isLocked: false };

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
});

const resolvedQuery = (value) => {
    const query = Promise.resolve(value);
    query.session = () => query;
    return query;
};

const leanQuery = (value) => ({
    select() { return this; },
    session() { return this; },
    lean: async () => value,
});

const mockSession = (t) => {
    t.mock.method(mongoose, "startSession", async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {},
    }));
};

const mockTestLifecycleContext = (t, testResource, { hasActiveAttempts = false, hasAttempts = false } = {}) => {
    mockSession(t);
    t.mock.method(TestModel, "updateOne", async () => ({ matchedCount: 1 }));
    t.mock.method(TestModel, "findOne", () => resolvedQuery(testResource));
    t.mock.method(Submission, "exists", (filter) => resolvedQuery(
        filter.submittedAt === null
            ? (hasActiveAttempts ? { _id: "active-attempt" } : null)
            : (hasAttempts ? { _id: "historical-attempt" } : null)
    ));
};

const mockQuestionUsage = (t, { tests = [], submissions = [] } = {}) => {
    t.mock.method(TestModel, "find", () => leanQuery(tests));
    t.mock.method(Submission, "find", () => leanQuery(submissions));
};

const mockQuestionWriteContext = (t, question, usage = {}) => {
    mockSession(t);
    mockQuestionUsage(t, usage);
    t.mock.method(Question, "findOne", () => resolvedQuery(question));
    t.mock.method(Question, "updateMany", async () => ({ matchedCount: 1 }));
};

test("teachers can lock their own test", async (t) => {
    const resource = { ...ownedTest, _id: testId };
    mockTestLifecycleContext(t, resource);
    let update;
    t.mock.method(TestModel, "findOneAndUpdate", async (filter, changes) => {
        update = { filter, changes };
        return { isLocked: true, lockedBy: ownerId, lockedAt: now };
    });
    const res = response();
    await lockTest({ params: { testId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(update.filter.teacher, ownerId);
    assert.deepEqual(update.filter.status.$in, ["drafted", "draft"]);
    assert.equal(update.changes.$set.isLocked, true);
});

test("teachers can unlock their own test", async (t) => {
    const resource = { ...ownedTest, _id: testId, isLocked: true };
    mockTestLifecycleContext(t, resource);
    let update;
    t.mock.method(TestModel, "findOneAndUpdate", async (filter, changes) => {
        update = { filter, changes };
        return { isLocked: false, lockedBy: null, lockedAt: null };
    });
    const res = response();
    await unlockTest({ params: { testId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(update.filter.teacher, ownerId);
    assert.equal(update.filter.isLocked, true);
    assert.deepEqual(update.changes.$set, {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
    });
});

test("teachers cannot lock another teacher's test", async (t) => {
    mockTestLifecycleContext(t, null);
    let filter;
    t.mock.method(TestModel, "findOneAndUpdate", async (query) => {
        filter = query;
        return null;
    });
    const res = response();
    await lockTest({ params: { testId }, user: { _id: otherTeacherId } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(filter, undefined);
});

test("teachers cannot unlock another teacher's test", async (t) => {
    mockTestLifecycleContext(t, null);
    let filter;
    t.mock.method(TestModel, "findOneAndUpdate", async (query) => {
        filter = query;
        return null;
    });
    const res = response();
    await unlockTest({ params: { testId }, user: { _id: otherTeacherId } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(filter, undefined);
});

test("authorized administrators can lock and unlock drafted tests", async (t) => {
    const resource = { ...ownedTest, _id: testId };
    mockTestLifecycleContext(t, resource);
    t.mock.method(TestModel, "findOneAndUpdate", async (_filter, changes) => {
        Object.assign(resource, changes.$set);
        return resource;
    });

    const lockResponse = response();
    await lockTest({ params: { testId }, user: { _id: "admin-1", role: "admin" } }, lockResponse);
    assert.equal(lockResponse.statusCode, 200);
    assert.equal(resource.isLocked, true);

    const unlockResponse = response();
    await unlockTest({ params: { testId }, user: { _id: "admin-1", role: "admin" } }, unlockResponse);
    assert.equal(unlockResponse.statusCode, 200);
    assert.equal(resource.isLocked, false);
});

test("teachers can lock their own question", async (t) => {
    mockSession(t);
    mockQuestionUsage(t);
    t.mock.method(Question, "findOne", () => resolvedQuery({ ...ownedQuestion, _id: questionId }));
    t.mock.method(Question, "updateMany", async () => ({ matchedCount: 1 }));
    let update;
    t.mock.method(Question, "findOneAndUpdate", async (filter, changes) => {
        update = { filter, changes };
        return { isLocked: true, lockedBy: ownerId, lockedAt: now };
    });
    const res = response();
    await lockQuestion({ params: { questionId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(update.filter.createdBy, ownerId);
    assert.equal(update.filter.isSystemProtected.$ne, true);
    assert.equal(update.changes.$set.isLocked, true);
});

test("teachers can unlock their own question", async (t) => {
    mockSession(t);
    mockQuestionUsage(t);
    t.mock.method(Question, "findOne", () => resolvedQuery({ ...ownedQuestion, _id: questionId, isLocked: true }));
    t.mock.method(Question, "updateMany", async () => ({ matchedCount: 1 }));
    let update;
    t.mock.method(Question, "findOneAndUpdate", async (filter, changes) => {
        update = { filter, changes };
        return { isLocked: false, lockedBy: null, lockedAt: null };
    });
    const res = response();
    await unlockQuestion({ params: { questionId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(update.filter.createdBy, ownerId);
    assert.equal(update.filter.isLocked, true);
    assert.equal(update.changes.$set.isLocked, false);
});

test("teachers cannot lock questions owned by another teacher", async (t) => {
    mockSession(t);
    t.mock.method(Question, "findOne", () => resolvedQuery(null));
    let filter;
    t.mock.method(Question, "findOneAndUpdate", async (query) => {
        filter = query;
        return null;
    });
    const res = response();
    await lockQuestion({ params: { questionId }, user: { _id: otherTeacherId } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(filter, undefined);
});

test("teachers cannot unlock questions owned by another teacher", async (t) => {
    mockSession(t);
    t.mock.method(Question, "findOne", () => resolvedQuery(null));
    let filter;
    t.mock.method(Question, "findOneAndUpdate", async (query) => {
        filter = query;
        return null;
    });
    const res = response();
    await unlockQuestion({ params: { questionId }, user: { _id: otherTeacherId } }, res);

    assert.equal(res.statusCode, 404);
    assert.equal(filter, undefined);
});

test("teacher-only routes reject students and administrators", () => {
    for (const role of ["student", "admin"]) {
        const res = response();
        let nextCalled = false;
        requireRole("teacher")({ user: { role } }, res, () => { nextCalled = true; });
        assert.equal(res.statusCode, 403);
        assert.equal(nextCalled, false);
    }
});

test("direct teacher API requests enforce authentication, role, and resource ownership", async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "resource-protection-test-secret";
    t.after(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    });

    const users = new Map([
        [ownerId, { _id: ownerId, role: "teacher", tokenVersion: 0 }],
        [otherTeacherId, { _id: otherTeacherId, role: "teacher", tokenVersion: 0 }],
        ["student-1", { _id: "student-1", role: "student", tokenVersion: 0 }],
        ["admin-1", { _id: "admin-1", role: "admin", tokenVersion: 0 }],
    ]);
    t.mock.method(User, "findById", (id) => ({
        select: async () => users.get(String(id)) || null,
    }));

    mockSession(t);
    t.mock.method(TestModel, "updateOne", async () => ({ matchedCount: 1 }));
    t.mock.method(TestModel, "findOne", (filter) => resolvedQuery(
        String(filter.teacher) === ownerId
            ? { ...ownedTest, _id: testId }
            : null
    ));
    t.mock.method(Submission, "exists", () => resolvedQuery(null));
    let updateFilter;
    t.mock.method(TestModel, "findOneAndUpdate", async (filter, changes) => {
        updateFilter = filter;
        if (String(filter.teacher) !== ownerId) return null;
        return {
            isLocked: changes.$set.isLocked,
            lockedBy: changes.$set.lockedBy,
            lockedAt: changes.$set.lockedAt,
        };
    });

    const app = express();
    app.use("/api/teacher", teacherRoutes);
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.once("listening", resolve));
    const address = server.address();
    const request = async (id, role) => fetch(
        `http://127.0.0.1:${address.port}/api/teacher/tests/${testId}/lock`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${jwt.sign({ id, role, tokenVersion: 0 }, process.env.JWT_SECRET)}`,
            },
        }
    );

    assert.equal((await request(ownerId, "teacher")).status, 200);
    assert.equal(updateFilter.teacher, ownerId);
    assert.equal((await request(otherTeacherId, "teacher")).status, 404);
    assert.equal((await request("student-1", "student")).status, 403);
    assert.equal((await request("admin-1", "admin")).status, 403);
});

test("teachers can close a published test with historical attempts after active attempts finish", async (t) => {
    let saved = false;
    const resource = {
        teacher: ownerId,
        status: "published",
        save: async () => { saved = true; },
    };
    mockTestLifecycleContext(t, resource, { hasAttempts: true });
    const res = response();
    await closeTest({ params: { testId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(resource.status, "closed");
    assert.equal(saved, true);
});

test("teachers cannot close a test while a student attempt is active", async (t) => {
    let saved = false;
    const resource = {
        teacher: ownerId,
        status: "published",
        save: async () => { saved = true; },
    };
    mockTestLifecycleContext(t, resource, { hasActiveAttempts: true, hasAttempts: true });
    const res = response();
    await closeTest({ params: { testId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(saved, false);
});

test("publishing a draft examination coordinates with question mutations", async (t) => {
    mockSession(t);
    const resource = {
        ...ownedTest,
        _id: testId,
        title: "Test",
        subject: "subject-1",
        durationMinutes: 10,
        assignedStudents: ["student-1"],
        questions: [questionId],
        startTime: null,
        save: async () => {},
    };
    t.mock.method(TestModel, "updateOne", async () => ({ matchedCount: 1 }));
    t.mock.method(TestModel, "findOne", () => resolvedQuery(resource));
    t.mock.method(Submission, "exists", () => resolvedQuery(null));
    let lockUpdate;
    t.mock.method(Question, "updateMany", async (filter, update) => {
        lockUpdate = { filter, update };
        return { matchedCount: 1 };
    });

    const res = response();
    await publishTest({
        params: { testId },
        user: { _id: ownerId },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(resource.status, "published");
    assert.deepEqual(lockUpdate.filter._id.$in, [questionId]);
    assert.equal(lockUpdate.update.$inc.__v, 1);
});

test("publishing rejects manually locked or incomplete drafted tests", async (t) => {
    const resource = {
        ...ownedTest,
        _id: testId,
        isLocked: true,
        save: async () => assert.fail("locked test was published"),
    };
    mockTestLifecycleContext(t, resource);

    const lockedResponse = response();
    await publishTest({ params: { testId }, user: { _id: ownerId } }, lockedResponse);
    assert.equal(lockedResponse.statusCode, 409);

    resource.isLocked = false;
    resource.title = "";
    const invalidResponse = response();
    await publishTest({ params: { testId }, user: { _id: ownerId } }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 400);
    assert.match(invalidResponse.body.message, /title is required/);
});

test("edit API rejects direct lifecycle changes and all published or closed content edits", async (t) => {
    const resource = {
        ...ownedTest,
        _id: testId,
        status: "published",
        save: async () => assert.fail("immutable test was edited"),
    };
    mockTestLifecycleContext(t, resource);

    const directStatusResponse = response();
    await updateTest({
        params: { testId },
        user: { _id: ownerId },
        body: { status: "closed" },
    }, directStatusResponse);
    assert.equal(directStatusResponse.statusCode, 400);

    for (const status of ["published", "closed"]) {
        resource.status = status;
        const res = response();
        await updateTest({
            params: { testId },
            user: { _id: ownerId },
            body: { title: "Changed" },
        }, res);
        assert.equal(res.statusCode, 409);
    }
});

test("published tests cannot be manually locked and drafted tests cannot be closed", async (t) => {
    const resource = { ...ownedTest, _id: testId, status: "published" };
    mockTestLifecycleContext(t, resource);
    t.mock.method(TestModel, "findOneAndUpdate", async () => assert.fail("published test was locked"));

    const lockResponse = response();
    await lockTest({ params: { testId }, user: { _id: ownerId } }, lockResponse);
    assert.equal(lockResponse.statusCode, 409);

    resource.status = "drafted";
    const closeResponse = response();
    await closeTest({ params: { testId }, user: { _id: ownerId } }, closeResponse);
    assert.equal(closeResponse.statusCode, 409);
});

test("tests with historical attempts cannot be deleted", async (t) => {
    const resource = { ...ownedTest, _id: testId };
    mockTestLifecycleContext(t, resource, { hasAttempts: true });
    t.mock.method(TestModel, "findOneAndDelete", async () => assert.fail("test with records was deleted"));

    const res = response();
    await deleteTest({ params: { testId }, user: { _id: ownerId } }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /examination records/);
});

test("starting a student attempt coordinates with question mutations", async (t) => {
    mockSession(t);
    t.mock.method(TestModel, "updateOne", async () => ({ matchedCount: 1 }));
    const question = {
        _id: questionId,
        questionText: "Prompt",
        options: { a: "A", b: "B", c: "C", d: "D" },
        correctOption: "a",
        mark: 1,
        difficulty: "easy",
    };
    const testResource = {
        _id: testId,
        status: "published",
        startTime: new Date("2026-11-04T00:00:00Z"),
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        assignedStudents: ["student-1"],
        questions: [question],
        title: "Exam",
        totalMarks: 1,
        passPercentage: 50,
        durationMinutes: 10,
    };
    t.mock.method(TestModel, "findById", () => ({
        populate() { return this; },
        session: () => Promise.resolve(testResource),
    }));
    t.mock.method(Submission, "findOne", () => resolvedQuery(null));
    t.mock.method(Submission.prototype, "save", async function () { return this; });
    let lockUpdate;
    t.mock.method(Question, "updateMany", async (filter, update) => {
        lockUpdate = { filter, update };
        return { matchedCount: 1 };
    });

    const res = response();
    await getCreateAttemptID({
        params: { testId },
        user: { _id: "student-1" },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(lockUpdate.filter._id.$in, [questionId]);
    assert.equal(lockUpdate.update.$inc.__v, 1);
    assert.ok(res.body.submissionId);
});

test("closed tests reject new attempts but let existing attempts resume", async (t) => {
    const closedTest = {
        _id: testId,
        status: "closed",
        assignedStudents: ["student-1"],
        questions: [],
        title: "Closed test",
        totalMarks: 0,
        passPercentage: 50,
        durationMinutes: 10,
    };
    mockSession(t);
    t.mock.method(TestModel, "updateOne", async () => ({ matchedCount: 1 }));
    t.mock.method(TestModel, "findById", () => ({
        populate() { return this; },
        session: () => Promise.resolve(closedTest),
    }));
    let activeAttempt = null;
    t.mock.method(Submission, "findOne", () => resolvedQuery(activeAttempt));
    const runAttemptStart = async () => {
        const res = response();
        await getCreateAttemptID({
            params: { testId },
            user: { _id: "student-1" },
        }, res);
        return res;
    };

    const newAttemptResponse = await runAttemptStart();
    assert.equal(newAttemptResponse.statusCode, 403);
    assert.match(newAttemptResponse.body.message, /not available/);

    const existing = {
        _id: "attempt-1",
        questionSnapshots: [{ question: questionId }],
        testSnapshot: { title: "Closed test" },
        save: async () => {},
    };
    activeAttempt = existing;
    const resumeResponse = await runAttemptStart();
    assert.equal(resumeResponse.statusCode, 200);
    assert.equal(resumeResponse.body.submissionId, existing._id);
});

test("locked tests are rejected by the edit and delete API handlers", async (t) => {
    const resource = {
        ...ownedTest,
        _id: testId,
        isLocked: true,
        save: async () => assert.fail("locked test was saved"),
    };
    mockTestLifecycleContext(t, resource);

    const updateResponse = response();
    await updateTest({
        params: { testId },
        user: { _id: ownerId },
        body: { title: "Changed title" },
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 409);

    t.mock.method(TestModel, "findOneAndDelete", async () => assert.fail("locked test was deleted"));
    const deleteResponse = response();
    await deleteTest({ params: { testId }, user: { _id: ownerId } }, deleteResponse);
    assert.equal(deleteResponse.statusCode, 409);
});

test("locked questions are rejected by the delete API handler", async (t) => {
    mockSession(t);
    mockQuestionUsage(t);
    t.mock.method(Question, "findOne", () => resolvedQuery({ ...ownedQuestion, isLocked: true }));
    t.mock.method(Question, "updateMany", async () => ({ matchedCount: 1 }));

    const res = response();
    await deleteQuestion({ params: { questionId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /manually locked/);
});

test("normal questions can be edited and deleted through owner APIs", async (t) => {
    const question = {
        ...ownedQuestion,
        _id: questionId,
        mark: 2,
        save: async () => {},
        toObject() { return { ...this }; },
    };
    mockQuestionWriteContext(t, question);
    t.mock.method(TestModel, "updateMany", async () => ({ modifiedCount: 0 }));
    let deleteFilter;
    t.mock.method(Question, "deleteOne", async (filter) => {
        deleteFilter = filter;
        return { deletedCount: 1 };
    });

    const updateResponse = response();
    await updateQuestion({
        params: { questionId },
        user: { _id: ownerId },
        body: { questionText: "Updated question" },
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 200);
    assert.equal(question.questionText, "Updated question");

    const deleteResponse = response();
    await deleteQuestion({ params: { questionId }, user: { _id: ownerId } }, deleteResponse);
    assert.equal(deleteResponse.statusCode, 200);
    assert.equal(deleteFilter.createdBy, ownerId);
});

test("question update and deletion APIs reject system-protected questions", async (t) => {
    const question = { ...ownedQuestion, _id: questionId, isSystemProtected: true, save: async () => assert.fail() };
    mockQuestionWriteContext(t, question);
    t.mock.method(Question, "deleteOne", async () => assert.fail("system-protected question was deleted"));

    const updateResponse = response();
    await updateQuestion({
        params: { questionId },
        user: { _id: ownerId },
        body: { questionText: "Changed" },
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 409);
    assert.match(updateResponse.body.message, /system protected/);

    const deleteResponse = response();
    await deleteQuestion({ params: { questionId }, user: { _id: ownerId } }, deleteResponse);
    assert.equal(deleteResponse.statusCode, 409);
    assert.match(deleteResponse.body.message, /system protected/);
});

test("question update and deletion APIs reject questions with examination records", async (t) => {
    const question = { ...ownedQuestion, _id: questionId, save: async () => assert.fail() };
    mockQuestionWriteContext(t, question, {
        tests: [{ _id: testId, questions: [questionId], status: "draft" }],
        submissions: [{ test: testId, answers: [], questionSnapshots: [] }],
    });
    t.mock.method(Question, "deleteOne", async () => assert.fail("question with records was deleted"));

    const updateResponse = response();
    await updateQuestion({
        params: { questionId },
        user: { _id: ownerId },
        body: { questionText: "Changed" },
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 409);
    assert.match(updateResponse.body.message, /examination records/);

    const deleteResponse = response();
    await deleteQuestion({ params: { questionId }, user: { _id: ownerId } }, deleteResponse);
    assert.equal(deleteResponse.statusCode, 409);
    assert.match(deleteResponse.body.message, /examination records/);
});

test("question update API rejects a question in a started examination without waiting for an answer", async (t) => {
    const question = { ...ownedQuestion, _id: questionId, save: async () => assert.fail() };
    mockQuestionWriteContext(t, question, {
        tests: [{
            _id: testId,
            questions: [questionId],
            status: "published",
            startTime: new Date("2026-11-04T00:00:00Z"),
        }],
    });

    const res = response();
    await updateQuestion({
        params: { questionId },
        user: { _id: ownerId },
        body: { questionText: "Changed" },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /started examination/);
});

test("manually locked questions cannot be edited or deleted through the API", async (t) => {
    const question = { ...ownedQuestion, _id: questionId, isLocked: true, save: async () => assert.fail() };
    mockQuestionWriteContext(t, question);
    t.mock.method(Question, "deleteOne", async () => assert.fail("manually locked question was deleted"));

    const updateResponse = response();
    await updateQuestion({
        params: { questionId },
        user: { _id: ownerId },
        body: { questionText: "Changed" },
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 409);
    assert.match(updateResponse.body.message, /manually locked/);

    const deleteResponse = response();
    await deleteQuestion({ params: { questionId }, user: { _id: ownerId } }, deleteResponse);
    assert.equal(deleteResponse.statusCode, 409);
    assert.match(deleteResponse.body.message, /manually locked/);
});

test("usage-protected questions cannot be manually unlocked through the API", async (t) => {
    const question = { ...ownedQuestion, _id: questionId, isLocked: true };
    mockSession(t);
    mockQuestionUsage(t, {
        tests: [{ _id: testId, questions: [questionId], status: "published", startTime: new Date("2026-11-04T00:00:00Z") }],
        submissions: [{ test: testId, answers: [], questionSnapshots: [] }],
    });
    t.mock.method(Question, "findOne", () => resolvedQuery(question));
    t.mock.method(Question, "updateMany", async () => ({ matchedCount: 1 }));
    t.mock.method(Question, "findOneAndUpdate", async () => assert.fail("usage-protected question was unlocked"));

    const res = response();
    await unlockQuestion({ params: { questionId }, user: { _id: ownerId } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /examination records/);
});

test("question update and deletion APIs do not reveal or modify another teacher's question", async (t) => {
    mockQuestionWriteContext(t, null);
    const updateResponse = response();
    await updateQuestion({
        params: { questionId },
        user: { _id: otherTeacherId },
        body: { questionText: "Changed" },
    }, updateResponse);
    assert.equal(updateResponse.statusCode, 404);

    const deleteResponse = response();
    await deleteQuestion({ params: { questionId }, user: { _id: otherTeacherId } }, deleteResponse);
    assert.equal(deleteResponse.statusCode, 404);
});

test("question and test difficulty matching accepts case differences and mixed difficulty", () => {
    assert.equal(normalizeDifficulty("Medium"), "medium");
    assert.equal(getDifficultyQuery("Medium").test("MEDIUM"), true);
    assert.equal(getDifficultyQuery("Medium").test(" Medium "), true);
    assert.equal(getDifficultyQuery("medium").test("mEdIuM"), true);
    assert.equal(getDifficultyQuery("Medium").test("hard"), false);
    assert.equal(getDifficultyQuery("unknown"), null);
    assert.equal(isQuestionDifficultyCompatible("Medium", "medium"), true);
    assert.equal(isQuestionDifficultyCompatible("medium", "Medium"), true);
    assert.equal(isQuestionDifficultyCompatible("mixed", "Medium"), true);
    assert.equal(isQuestionDifficultyCompatible("Medium", "hard"), false);
    assert.equal(isQuestionDifficultyCompatible("unknown", "unknown"), false);
});

test("accessible questions for a title-case medium test include medium questions", async (t) => {
    let questionFilter;
    t.mock.method(TestModel, "findOne", filter => ({
        populate: async () => ({
            _id: testId,
            teacher: ownerId,
            subject: { _id: "subject-1" },
            difficulty: "Medium",
        }),
    }));
    t.mock.method(Question, "find", filter => {
        questionFilter = filter;
        return {
            populate: async () => [{
                _id: questionId,
                difficulty: "medium",
            }],
        };
    });

    const res = response();
    await getAccessibleQuestions({ params: { testId }, user: { _id: ownerId } }, res);

    assert.equal(questionFilter.difficulty.test("MEDIUM"), true);
    assert.equal(questionFilter.difficulty.test("Medium "), true);
    assert.equal(questionFilter.difficulty.test("hard"), false);
    assert.equal(questionFilter.subject, "subject-1");
    assert.deepEqual(questionFilter.$or, [
        { createdBy: ownerId },
        { allowedTeachers: ownerId },
    ]);
    assert.equal(res.body[0].difficulty, "medium");
});

test("resource ownership checks distinguish owners from other teachers", () => {
    assert.equal(isOwnedBy(ownedTest, "teacher", ownerId), true);
    assert.equal(isOwnedBy(ownedTest, "teacher", otherTeacherId), false);
    assert.equal(isOwnedBy(ownedQuestion, "createdBy", ownerId), true);
    assert.equal(isOwnedBy(ownedQuestion, "createdBy", otherTeacherId), false);
});

test("manually locked tests cannot be edited or deleted", () => {
    const lockedTest = { ...ownedTest, isLocked: true };
    assert.match(getTestProtectionReason(lockedTest, {}, "update", now), /manually locked/);
    assert.match(getTestProtectionReason(lockedTest, {}, "delete", now), /manually locked/);
});

test("active attempts prevent test edits and deletion", () => {
    const state = { hasActiveAttempts: true, hasAttempts: true };
    assert.match(getTestProtectionReason(ownedTest, state, "update", now), /attempt in progress/);
    assert.match(getTestProtectionReason(ownedTest, state, "delete", now), /attempt in progress/);
});

test("historical test results prevent configuration changes and permanent deletion", () => {
    const state = { hasAttempts: true };
    assert.match(getTestProtectionReason(ownedTest, state, "update", now), /examination records/);
    assert.match(getTestProtectionReason(ownedTest, state, "delete", now), /permanently deleted/);
});

test("published tests cannot be edited or deleted regardless of availability", () => {
    const published = { status: "published", isLocked: false };
    assert.match(getTestProtectionReason(published, {}, "update", now), /immutable/);
    assert.match(getTestProtectionReason(published, {}, "delete", now), /cannot be deleted/);
});

test("draft tests remain editable while all published tests are immutable", () => {
    assert.equal(getTestProtectionReason(ownedTest, {}, "update", now), null);
    assert.match(getTestProtectionReason({
        status: "published",
        startTime: new Date("2026-11-06T00:00:00.000Z"),
        isLocked: false,
    }, {}, "update", now), /immutable/);
});

test("test lifecycle capabilities keep status, manual locking, and attempts separate", () => {
    const drafted = { ...ownedTest, status: "drafted" };
    const published = { ...drafted, status: "published" };
    const closed = { ...drafted, status: "closed" };
    const lockedDraft = { ...drafted, isLocked: true };

    assert.equal(canEditTest(drafted, {}, ownerId), true);
    assert.equal(canLockTest(drafted, {}, ownerId), true);
    assert.equal(canUnlockTest(lockedDraft, {}, ownerId), true);
    assert.equal(canPublishTest(drafted, {}, ownerId), true);
    assert.equal(canPublishTest(lockedDraft, {}, ownerId), false);
    assert.equal(canEditTest(published, {}, ownerId), false);
    assert.equal(canLockTest(published, {}, ownerId), false);
    assert.equal(canUnlockTest({ ...published, isLocked: true }, {}, ownerId), false);
    assert.equal(canEditTest(closed, {}, ownerId), false);
    assert.equal(canDeleteTest(closed, {}, ownerId), false);
    assert.equal(canCloseTest(published, { hasAttempts: true }, ownerId), true);
    assert.equal(canCloseTest(published, { hasActiveAttempts: true }, ownerId), false);
    assert.equal(getTestLifecycleState(published, { hasAttempts: true }, ownerId).canClose, true);
    assert.equal(getTestLifecycleState(published, { hasAttempts: true }, ownerId).closeProtectionReason, null);
});

test("manually locked questions cannot be modified or deleted", () => {
    assert.match(getQuestionProtectionReason({ isLocked: true }), /manually locked/);
});

test("questions in started examinations are automatically protected", () => {
    assert.match(getQuestionProtectionReason(ownedQuestion, { usedByStartedTest: true }), /started examination/);
});

test("questions referenced by examination attempts are protected", () => {
    assert.match(getQuestionProtectionReason(ownedQuestion, { hasAttempts: true }), /examination records/);
});

test("draft questions remain editable but cannot be deleted while referenced", () => {
    const usage = { draftTestCount: 1 };
    const state = getQuestionProtectionState(ownedQuestion, usage, ownerId);
    assert.equal(getQuestionProtectionReason(ownedQuestion, usage), null);
    assert.equal(state.canEdit, true);
    assert.equal(state.canDelete, false);
    assert.match(state.deleteProtectionReason, /Remove this question from editable draft examinations/);
});

test("system, manual, and usage protection are independent and expose capabilities", () => {
    const manualQuestion = { ...ownedQuestion, isLocked: true };
    const systemQuestion = { ...ownedQuestion, isSystemProtected: true };
    const usage = { hasExaminationRecords: true };

    assert.equal(isSystemProtected(systemQuestion), true);
    assert.equal(isManuallyLocked(manualQuestion), true);
    assert.equal(isInUse(usage), true);
    assert.equal(isProtected(systemQuestion), true);
    assert.equal(canEdit(systemQuestion, {}, ownerId), false);
    assert.equal(canDelete(manualQuestion, {}, ownerId), false);
    assert.equal(canLock(ownedQuestion, {}, ownerId), true);
    assert.equal(canUnlock(manualQuestion, {}, ownerId), true);
    assert.equal(canUnlock(manualQuestion, usage, ownerId), false);
    assert.equal(canUnlock({ ...manualQuestion, isSystemProtected: true }, {}, ownerId), false);
});

test("unlocking a manual lock does not bypass automatic test protection", () => {
    const unlocked = getManualLockUpdate(ownerId, false, now);
    assert.equal(unlocked.isLocked, false);
    assert.match(getTestProtectionReason({
        status: "published",
        ...unlocked,
    }, {}, "update", now), /immutable/);
});

test("unlocking a manual lock does not bypass automatic question protection", () => {
    const unlocked = getManualLockUpdate(ownerId, false, now);
    assert.equal(unlocked.isLocked, false);
    assert.match(getQuestionProtectionReason(
        { ...unlocked },
        { usedByStartedTest: true }
    ), /started examination/);
});

test("a future published examination does not protect its questions before it starts", async (t) => {
    mockQuestionUsage(t, {
        tests: [
            { _id: testId, questions: [questionId], status: "published", startTime: new Date("2026-11-06T00:00:00Z") },
        ],
    });
    const usage = await getQuestionAttemptState(questionId, null, now);
    assert.equal(usage.isInUse, false);
});

test("removing a question from a draft examination restores normal edit and delete permissions", async (t) => {
    mockQuestionUsage(t, {
        tests: [{ _id: testId, questions: [], status: "draft" }],
    });
    const usage = await getQuestionAttemptState(questionId, null, now);
    const state = getQuestionProtectionState(ownedQuestion, usage, ownerId);
    assert.equal(state.isInUse, false);
    assert.equal(state.canEdit, true);
    assert.equal(state.canDelete, true);
});

test("a started examination or its attempt records protects a question", async (t) => {
    mockQuestionUsage(t, {
        tests: [
            { _id: testId, questions: [questionId], status: "published", startTime: new Date("2026-11-04T00:00:00Z") },
        ],
        submissions: [{ test: testId, answers: [], questionSnapshots: [] }],
    });
    const usage = await getQuestionAttemptState(questionId, null, now);
    assert.equal(usage.usedByStartedTest, true);
    assert.equal(usage.hasExaminationRecords, true);
    assert.deepEqual(usage.examinationIds, [testId]);
});

test("multiple examination records keep protection after one examination removes the question", async (t) => {
    const secondTestId = "507f1f77bcf86cd799439013";
    mockQuestionUsage(t, {
        tests: [
            { _id: secondTestId, questions: [questionId], status: "published", startTime: new Date("2026-11-04T00:00:00Z") },
            { _id: testId, questions: [], status: "closed" },
        ],
        submissions: [{
            test: testId,
            answers: [],
            questionSnapshots: [{ question: questionId }],
        }],
    });
    const usage = await getQuestionAttemptState(questionId, null, now);
    assert.equal(usage.isInUse, true);
    assert.deepEqual(new Set(usage.examinationIds), new Set([testId, secondTestId]));
});

test("system protection remains separate from examination-use protection", () => {
    const state = getQuestionProtectionState(
        { ...ownedQuestion, isSystemProtected: true },
        {},
        ownerId
    );
    assert.equal(state.protectionType, "system");
    assert.equal(state.isInUse, false);
    assert.equal(state.canUnlock, false);
});

test("unlocking clears the manual lock owner and timestamp", () => {
    assert.deepEqual(getManualLockUpdate(ownerId, false, now), {
        isLocked: false,
        lockedBy: null,
        lockedAt: null,
    });
});

test("attempt snapshots preserve test and question values for historical results", () => {
    const testData = { title: "Final", totalMarks: 4, passPercentage: 50, durationMinutes: 20 };
    const questionData = {
        _id: "question-1",
        questionText: "Original prompt",
        options: { a: "Original answer", b: "B", c: "C", d: "D" },
        correctOption: "a",
        mark: 4,
    };
    const snapshot = createAttemptSnapshot(testData, [questionData]);
    questionData.questionText = "Changed prompt";
    questionData.correctOption = "b";
    testData.totalMarks = 99;

    assert.equal(snapshot.testSnapshot.totalMarks, 4);
    assert.equal(snapshot.questionSnapshots[0].questionText, "Original prompt");
    const graded = gradeAttemptAnswers(
        [{ question: "question-1", selected: "a" }],
        snapshot.questionSnapshots
    );
    assert.equal(graded.score, 4);
    assert.equal(graded.correct, 1);
    assert.equal(graded.answerSnapshots[0].questionSnapshot.questionText, "Original prompt");
});
