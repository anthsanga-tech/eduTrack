import mongoose from "mongoose";
import Question from "../models/Question.js";
import Test from "../models/Test.js";
import {
    acquireQuestionWriteLocks,
    acquireTestLifecycleWriteLock,
    canLock,
    canLockTest,
    canUnlock,
    canUnlockTest,
    getManualLockUpdate,
    getQuestionAttemptState,
    getQuestionProtectionReason,
    getTestAttemptState,
    getTestProtectionReason,
} from "../services/resourceProtection.js";

const resourceModels = {
    test: { model: Test, ownerField: "teacher" },
    question: { model: Question, ownerField: "createdBy" },
};

const updateResourceLock = (resourceType, isLocked) => async (req, res) => {
    const resourceId = resourceType === "test" ? req.params.testId : req.params.questionId;
    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
        return res.status(400).json({ message: `Invalid ${resourceType} ID` });
    }

    const { model, ownerField } = resourceModels[resourceType];
    if (resourceType === "test") {
        let session;
        let statusCode = 500;
        try {
            session = await mongoose.startSession();
            let updatedTest;
            await session.withTransaction(async () => {
                await acquireTestLifecycleWriteLock(resourceId, session);
                const test = await Test.findOne({
                    _id: resourceId,
                    ...(req.user.role === "admin" ? {} : { teacher: req.user._id }),
                }).session(session);
                if (!test) {
                    statusCode = 404;
                    throw new Error("Test not found");
                }

                const attempts = await getTestAttemptState(test._id, session);
                const allowed = isLocked
                    ? canLockTest(test, attempts, req.user._id, req.user.role === "admin")
                    : canUnlockTest(test, attempts, req.user._id, req.user.role === "admin");
                if (!allowed) {
                    statusCode = 409;
                    throw new Error(
                        getTestProtectionReason(test, attempts, isLocked ? "lock" : "unlock") ||
                        (isLocked ? "This test cannot be locked." : "This test cannot be unlocked.")
                    );
                }

                updatedTest = await Test.findOneAndUpdate(
                    {
                        _id: resourceId,
                        ...(req.user.role === "admin" ? {} : { teacher: req.user._id }),
                        status: { $in: ["drafted", "draft"] },
                        isLocked: isLocked ? { $ne: true } : true,
                    },
                    { $set: getManualLockUpdate(req.user._id, isLocked) },
                    { new: true, runValidators: true, session }
                );
                if (!updatedTest) {
                    statusCode = 409;
                    throw new Error("Test lifecycle changed; reload and try again.");
                }
            });

            return res.json({
                success: true,
                message: `Test ${isLocked ? "locked" : "unlocked"}`,
                isLocked: updatedTest.isLocked,
                lockedBy: updatedTest.lockedBy,
                lockedAt: updatedTest.lockedAt,
            });
        } catch (error) {
            if (statusCode === 500 && error.statusCode) statusCode = error.statusCode;
            if (statusCode === 500) console.error(`Failed to ${isLocked ? "lock" : "unlock"} test:`, error);
            return res.status(statusCode).json({
                message: statusCode === 500 ? "Unable to update test lock" : error.message,
            });
        } finally {
            if (session) await session.endSession();
        }
    }

    if (resourceType === "question") {
        let session;
        let statusCode = 500;
        try {
            session = await mongoose.startSession();
            let updatedQuestion;
            await session.withTransaction(async () => {
                let question = await Question.findOne({
                    _id: resourceId,
                    createdBy: req.user._id,
                }).session(session);
                if (!question) {
                    statusCode = 404;
                    throw new Error("Question not found");
                }

                await acquireQuestionWriteLocks([question._id], session);
                question = await Question.findOne({
                    _id: resourceId,
                    createdBy: req.user._id,
                }).session(session);
                if (!question) {
                    statusCode = 404;
                    throw new Error("Question not found");
                }
                const usage = await getQuestionAttemptState(question._id, session);
                const allowed = isLocked
                    ? canLock(question, usage, req.user._id)
                    : canUnlock(question, usage, req.user._id);
                if (!allowed) {
                    statusCode = 409;
                    throw new Error(
                        getQuestionProtectionReason(question, usage) ||
                        (isLocked
                            ? "This question cannot be manually locked."
                            : "This question cannot be manually unlocked.")
                    );
                }

                updatedQuestion = await Question.findOneAndUpdate(
                    {
                        _id: resourceId,
                        createdBy: req.user._id,
                        isSystemProtected: { $ne: true },
                        isLocked: isLocked ? { $ne: true } : true,
                    },
                    { $set: getManualLockUpdate(req.user._id, isLocked) },
                    { new: true, runValidators: true, session }
                );
                if (!updatedQuestion) {
                    statusCode = 409;
                    throw new Error("Question protection changed; reload and try again.");
                }
            });

            return res.json({
                success: true,
                message: `Question ${isLocked ? "locked" : "unlocked"}`,
                isLocked: updatedQuestion.isLocked,
                lockedBy: updatedQuestion.lockedBy,
                lockedAt: updatedQuestion.lockedAt,
            });
        } catch (error) {
            if (statusCode === 500 && error.statusCode) statusCode = error.statusCode;
            if (statusCode === 500) console.error(`Failed to ${isLocked ? "lock" : "unlock"} question:`, error);
            return res.status(statusCode).json({
                message: statusCode === 500 ? "Unable to update question lock" : error.message,
            });
        } finally {
            if (session) await session.endSession();
        }
    }

    try {
        const resource = await model.findOneAndUpdate(
            { _id: resourceId, [ownerField]: req.user._id },
            { $set: getManualLockUpdate(req.user._id, isLocked) },
            { new: true, runValidators: true }
        );

        if (!resource) {
            return res.status(404).json({ message: `${resourceType} not found` });
        }

        return res.json({
            success: true,
            message: `${resourceType === "test" ? "Test" : "Question"} ${isLocked ? "locked" : "unlocked"}`,
            isLocked: resource.isLocked,
            lockedBy: resource.lockedBy,
            lockedAt: resource.lockedAt,
        });
    } catch (error) {
        console.error(`Failed to ${isLocked ? "lock" : "unlock"} ${resourceType}:`, error);
        return res.status(500).json({ message: `Unable to ${isLocked ? "lock" : "unlock"} ${resourceType}` });
    }
};

export const lockTest = updateResourceLock("test", true);
export const unlockTest = updateResourceLock("test", false);
export const lockQuestion = updateResourceLock("question", true);
export const unlockQuestion = updateResourceLock("question", false);
