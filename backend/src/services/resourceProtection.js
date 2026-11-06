import Submission from "../models/Submission.js";
import Test from "../models/Test.js";
import Question from "../models/Question.js";

export const isOwnedBy = (resource, ownerField, userId) =>
    String(resource?.[ownerField]?._id ?? resource?.[ownerField]) === String(userId);

export const normalizeTestStatus = (status) => status === "draft" ? "drafted" : status;

export const isDrafted = (test) => ["draft", "drafted"].includes(test?.status);

export const isPublished = (test) => test?.status === "published";

export const isClosed = (test) => test?.status === "closed";

export const isTestManuallyLocked = (test) => Boolean(test?.isLocked);

export const isTestAvailable = (test, now = new Date()) =>
    isPublished(test) &&
    (!test.startTime || new Date(test.startTime) <= now) &&
    (!test.dueDate || new Date(test.dueDate) > now);

export const isTestStarted = (test, now = new Date()) =>
    (isPublished(test) || isClosed(test)) &&
    (!test.startTime || new Date(test.startTime) <= now);

export const hasStartedAttempts = (attemptState = {}) =>
    Boolean(attemptState.hasActiveAttempts);

export const hasHistoricalAttempts = (attemptState = {}) =>
    Boolean(attemptState.hasAttempts);

const canManageTest = (test, userId, isAdmin) =>
    Boolean(isAdmin) || isOwnedBy(test, "teacher", userId);

export const canEditTest = (test, attemptState = {}, userId) =>
    isOwnedBy(test, "teacher", userId) &&
    isDrafted(test) &&
    !isTestManuallyLocked(test) &&
    !hasHistoricalAttempts(attemptState);

export const canDeleteTest = (test, attemptState = {}, userId) =>
    isOwnedBy(test, "teacher", userId) &&
    isDrafted(test) &&
    !isTestManuallyLocked(test) &&
    !hasHistoricalAttempts(attemptState);

export const canLockTest = (test, attemptState = {}, userId, isAdmin = false) =>
    canManageTest(test, userId, isAdmin) &&
    isDrafted(test) &&
    !isTestManuallyLocked(test) &&
    !hasHistoricalAttempts(attemptState);

export const canUnlockTest = (test, attemptState = {}, userId, isAdmin = false) =>
    canManageTest(test, userId, isAdmin) &&
    isDrafted(test) &&
    isTestManuallyLocked(test) &&
    !hasHistoricalAttempts(attemptState);

export const canPublishTest = (test, attemptState = {}, userId) =>
    isOwnedBy(test, "teacher", userId) &&
    isDrafted(test) &&
    !isTestManuallyLocked(test) &&
    !hasHistoricalAttempts(attemptState);

export const canCloseTest = (test, attemptState = {}, userId) =>
    isOwnedBy(test, "teacher", userId) &&
    isPublished(test) &&
    !hasStartedAttempts(attemptState);

export const getTestLifecycleState = (test, attemptState = {}, userId) => {
    const publishProtectionReason = getTestProtectionReason(test, attemptState, "publish")
        || getTestPublicationValidationError(test);
    const closeProtectionReason = getTestProtectionReason(test, attemptState, "close");
    const lockProtectionReason = getTestProtectionReason(test, attemptState, "lock");
    const unlockProtectionReason = getTestProtectionReason(test, attemptState, "unlock");

    return {
        lifecycleStatus: normalizeTestStatus(test?.status),
        isDrafted: isDrafted(test),
        isPublished: isPublished(test),
        isClosed: isClosed(test),
        isManuallyLocked: isTestManuallyLocked(test),
        hasStartedAttempts: hasStartedAttempts(attemptState),
        hasHistoricalAttempts: hasHistoricalAttempts(attemptState),
        canView: Boolean(test),
        canEdit: canEditTest(test, attemptState, userId),
        canDelete: canDeleteTest(test, attemptState, userId),
        canLock: canLockTest(test, attemptState, userId),
        canUnlock: canUnlockTest(test, attemptState, userId),
        canPublish: canPublishTest(test, attemptState, userId) && !publishProtectionReason,
        canClose: canCloseTest(test, attemptState, userId),
        editProtectionReason: getTestProtectionReason(test, attemptState, "update"),
        deleteProtectionReason: getTestProtectionReason(test, attemptState, "delete"),
        publishProtectionReason,
        closeProtectionReason,
        lockProtectionReason,
        unlockProtectionReason,
    };
};

export const getTestProtectionReason = (
    test,
    { hasActiveAttempts = false, hasAttempts = false } = {},
    operation = "update",
    now = new Date()
) => {
    if (operation === "close") {
        if (hasActiveAttempts) return "This test has an attempt in progress and cannot be closed.";
        return isPublished(test) ? null : "Only published tests can be closed.";
    }
    if (hasActiveAttempts) return "This test has an attempt in progress and cannot be changed.";
    if (hasAttempts) {
        return operation === "delete"
            ? "This test has examination records and cannot be permanently deleted."
            : "This test has examination records and its configuration cannot be changed.";
    }
    if (operation === "lock" || operation === "unlock") {
        if (!isDrafted(test)) return "Only drafted tests can be manually locked or unlocked.";
        if (operation === "unlock" && !test?.isLocked) return "This test is not manually locked.";
        if (operation === "lock" && test?.isLocked) return "This test is already manually locked.";
        return null;
    }
    if (operation === "publish") {
        if (!isDrafted(test)) return "Only drafted tests can be published.";
        if (test?.isLocked) return "Unlock this test before publishing it.";
        return null;
    }
    if (test?.isLocked) return "This test is manually locked. Unlock it before making changes.";
    if (isPublished(test)) {
        return operation === "delete"
            ? "Published tests cannot be deleted."
            : "Published tests are immutable and cannot be changed.";
    }
    if (isClosed(test)) {
        return operation === "delete"
            ? "Closed tests are read-only and cannot be deleted."
            : "Closed tests are read-only and cannot be changed.";
    }
    if (!isDrafted(test)) return "This test has an invalid lifecycle status.";
    if (isTestAvailable(test, now)) {
        return operation === "delete"
            ? "This published test is currently available to students and cannot be deleted."
            : "This published test is currently available to students and cannot be changed.";
    }
    if (isTestStarted(test, now)) {
        return operation === "delete"
            ? "This examination has started and cannot be deleted."
            : "This examination has started and its configuration cannot be changed.";
    }
    return null;
};

export const getTestPublicationValidationError = (test) => {
    if (!test?.title?.trim()) return "A test title is required before publishing.";
    if (!test?.subject) return "A subject is required before publishing.";
    if (!Number.isFinite(Number(test?.durationMinutes)) || Number(test.durationMinutes) < 1) {
        return "A valid test duration is required before publishing.";
    }
    if (!test?.questions?.length) return "Add at least one question before publishing.";
    if (!test?.assignedStudents?.length) return "Assign at least one student before publishing.";
    if (test.startTime && test.dueDate && new Date(test.dueDate) <= new Date(test.startTime)) {
        return "The due date must be after the test start time.";
    }
    if (test.difficulty === "mixed" && (
        !Array.isArray(test.difficultyTags) ||
        test.difficultyTags.length < 2 ||
        new Set(test.difficultyTags).size !== test.difficultyTags.length ||
        test.difficultyTags.some(tag => !["easy", "medium", "hard"].includes(tag))
    )) {
        return "Select at least two unique difficulty tags before publishing a mixed-difficulty test.";
    }
    return null;
};

export const acquireTestLifecycleWriteLock = async (testId, session) => {
    const result = await Test.updateOne(
        { _id: testId },
        { $inc: { __v: 1 } },
        { session }
    );
    if (!result.matchedCount) {
        throw Object.assign(new Error("Test not found"), { statusCode: 404 });
    }
};

export const getQuestionProtectionReason = (
    question,
    usage = {}
) => {
    if (isSystemProtected(question)) return "This question is system protected and cannot be modified.";
    if (isInUse(usage)) {
        return usage.hasExaminationRecords || usage.hasAttempts
            ? "This question is used in examination records and cannot be modified."
            : "This question is in a started examination and cannot be modified.";
    }
    if (isManuallyLocked(question)) return "This question is manually locked. Unlock it before making changes.";
    return null;
};

export const isSystemProtected = (question) => Boolean(question?.isSystemProtected);

export const isManuallyLocked = (question) => Boolean(question?.isLocked);

export const isInUse = (usage = {}) =>
    Boolean(usage.isInUse || usage.usedByStartedTest || usage.hasAttempts || usage.hasExaminationRecords);

export const isProtected = (question, usage = {}) =>
    isSystemProtected(question) || isManuallyLocked(question) || isInUse(usage);

export const canEdit = (question, usage, userId) =>
    isOwnedBy(question, "createdBy", userId) && !isProtected(question, usage);

export const canDelete = (question, usage, userId) =>
    isOwnedBy(question, "createdBy", userId) &&
    !isProtected(question, usage) &&
    !usage?.draftTestCount;

export const canLock = (question, usage, userId) =>
    isOwnedBy(question, "createdBy", userId) && !isProtected(question, usage);

export const canUnlock = (question, usage, userId) =>
    isOwnedBy(question, "createdBy", userId) &&
    isManuallyLocked(question) &&
    !isSystemProtected(question) &&
    !isInUse(usage);

export const getQuestionDeleteProtectionReason = (question, usage = {}) =>
    getQuestionProtectionReason(question, usage) ||
    (usage.draftTestCount
        ? "Remove this question from editable draft examinations before deleting it."
        : null);

export const getQuestionProtectionState = (question, usage = {}, userId) => {
    const systemProtected = isSystemProtected(question);
    const manuallyLocked = isManuallyLocked(question);
    const inUse = isInUse(usage);
    const protectionType = systemProtected
        ? "system"
        : inUse
            ? "usage"
            : manuallyLocked
                ? "manual"
                : null;

    return {
        isSystemProtected: systemProtected,
        isManuallyLocked: manuallyLocked,
        isInUse: inUse,
        isProtected: Boolean(protectionType),
        protectionType,
        protectionReason: getQuestionProtectionReason(question, usage),
        deleteProtectionReason: getQuestionDeleteProtectionReason(question, usage),
        canEdit: canEdit(question, usage, userId),
        canDelete: canDelete(question, usage, userId),
        canLock: canLock(question, usage, userId),
        canUnlock: canUnlock(question, usage, userId),
        hasExaminationRecords: Boolean(usage.hasExaminationRecords || usage.hasAttempts),
        associatedExaminationCount: usage.examinationIds?.length || 0,
        associatedExaminations: usage.associatedExaminations || [],
    };
};

export const acquireQuestionWriteLocks = async (questionIds, session) => {
    const ids = [...new Set(questionIds.map(String))];
    if (!ids.length) return;

    const result = await Question.updateMany(
        { _id: { $in: ids } },
        { $inc: { __v: 1 } },
        { session }
    );
    if (result.matchedCount !== ids.length) {
        throw Object.assign(new Error("An examination question is no longer available."), {
            statusCode: 409,
        });
    }
};

export const getTestAttemptState = async (testId, session) => {
    const activeQuery = Submission.exists({ test: testId, submittedAt: null });
    const attemptsQuery = Submission.exists({ test: testId });
    if (session) {
        activeQuery.session(session);
        attemptsQuery.session(session);
    }
    const [hasActiveAttempts, hasAttempts] = await Promise.all([activeQuery, attemptsQuery]);
    return { hasActiveAttempts: Boolean(hasActiveAttempts), hasAttempts: Boolean(hasAttempts) };
};

export const getQuestionAttemptState = async (questionId, session, now = new Date()) => {
    const states = await getQuestionProtectionStates([questionId], session, now);
    return states.get(String(questionId)) || {};
};

export const getQuestionProtectionStates = async (questionIds, session, now = new Date()) => {
    if (!questionIds.length) return new Map();

    const testsQuery = Test.find({ questions: { $in: questionIds } })
        .select("_id questions status startTime dueDate title teacher");
    if (session) testsQuery.session(session);
    const tests = await testsQuery.lean();
    const testIds = tests.map((test) => test._id);
    const submissionsQuery = Submission.find({
        $or: [
            ...(testIds.length ? [{ test: { $in: testIds } }] : []),
            { "answers.question": { $in: questionIds } },
            { "questionSnapshots.question": { $in: questionIds } },
        ],
    }).select("test answers.question questionSnapshots.question");
    if (session) submissionsQuery.session(session);
    const submissions = await submissionsQuery.lean();

    const testsById = new Map(tests.map((test) => [String(test._id), test]));
    const attemptsByTest = new Set(submissions.map((submission) => String(submission.test)));
    const testsByQuestion = new Map();
    const requestedQuestionIds = new Set(questionIds.map(String));

    const addTestForQuestion = (questionId, testId) => {
        const key = String(questionId);
        if (!requestedQuestionIds.has(key)) return;
        const testKeys = testsByQuestion.get(key) || new Set();
        testKeys.add(String(testId));
        testsByQuestion.set(key, testKeys);
    };

    for (const test of tests) {
        for (const questionId of test.questions || []) {
            addTestForQuestion(questionId, test._id);
        }
    }

    for (const submission of submissions) {
        for (const answer of submission.answers || []) {
            addTestForQuestion(answer.question, submission.test);
        }
        for (const snapshot of submission.questionSnapshots || []) {
            addTestForQuestion(snapshot.question, submission.test);
        }
    }

    const relatedTestIds = [...new Set(
        [...testsByQuestion.values()].flatMap((ids) => [...ids])
    )];
    const missingTestIds = relatedTestIds.filter((testId) => !testsById.has(testId));
    if (missingTestIds.length) {
        const relatedTestsQuery = Test.find({ _id: { $in: missingTestIds } })
            .select("_id questions status startTime dueDate title teacher");
        if (session) relatedTestsQuery.session(session);
        for (const test of await relatedTestsQuery.lean()) {
            testsById.set(String(test._id), test);
        }
    }

    return new Map(questionIds.map((questionId) => {
        const key = String(questionId);
        const associatedTests = [...(testsByQuestion.get(key) || [])]
            .map((testId) => testsById.get(testId))
            .filter(Boolean);
        const startedTests = associatedTests.filter((test) => isTestStarted(test, now));
        const testsWithRecords = associatedTests.filter((test) => attemptsByTest.has(String(test._id)));
        const hasDirectRecords = submissions.some((submission) =>
            [...(submission.answers || []).map((answer) => answer.question),
                ...(submission.questionSnapshots || []).map((snapshot) => snapshot.question)]
                .some((recordedQuestionId) => String(recordedQuestionId) === key)
        );
        const examinationIds = associatedTests
            .filter((test) => isTestStarted(test, now) || attemptsByTest.has(String(test._id)))
            .map((test) => String(test._id));
        const hasExaminationRecords = testsWithRecords.length > 0 || hasDirectRecords;
        const draftTestCount = tests.filter((test) =>
            isDrafted(test) && (test.questions || []).some((id) => String(id) === key)
        ).length;

        return [key, {
            usedByStartedTest: startedTests.length > 0,
            hasAttempts: hasExaminationRecords,
            hasExaminationRecords,
            isInUse: startedTests.length > 0 || hasExaminationRecords,
            examinationIds,
            draftTestCount,
        }];
    }));
};

export const getManualLockUpdate = (userId, isLocked, now = new Date()) => ({
    isLocked,
    lockedBy: isLocked ? userId : null,
    lockedAt: isLocked ? now : null,
});

export const createAttemptSnapshot = (test, questions) => ({
    testSnapshot: {
        title: test.title,
        totalMarks: test.totalMarks,
        passPercentage: test.passPercentage,
        durationMinutes: test.durationMinutes,
    },
    questionSnapshots: questions.map((question) => ({
        question: question._id,
        questionText: question.questionText,
        options: { ...question.options },
        correctOption: question.correctOption,
        mark: question.mark,
        difficulty: question.difficulty,
    })),
});

export const gradeAttemptAnswers = (answers, questionSnapshots) => {
    const snapshotByQuestion = new Map(
        questionSnapshots.map((question) => [String(question.question), question])
    );
    let correct = 0;
    let score = 0;
    const answerSnapshots = answers.map((answer) => {
        const questionSnapshot = snapshotByQuestion.get(String(answer.question));
        if (!questionSnapshot) return null;
        if (questionSnapshot.correctOption === answer.selected) {
            score += questionSnapshot.mark || 1;
            correct++;
        }
        return {
            question: answer.question,
            selected: answer.selected,
            questionSnapshot: {
                questionText: questionSnapshot.questionText,
                options: questionSnapshot.options,
                correctOption: questionSnapshot.correctOption,
                mark: questionSnapshot.mark,
                difficulty: questionSnapshot.difficulty,
            },
        };
    });

    return {
        answerSnapshots,
        score,
        correct,
        wrong: answers.length - correct,
    };
};
