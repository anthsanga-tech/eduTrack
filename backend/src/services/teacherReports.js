import mongoose from "mongoose";
import { gradeAttemptAnswers } from "./resourceProtection.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parsePagination = (query) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 25);
    if (!Number.isInteger(page) || page < 1) throw new Error("page must be a positive integer");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("limit must be an integer between 1 and 100");
    }
    return { page, limit, skip: (page - 1) * limit };
};

export const parseReportFilters = (query) => {
    const filters = {};
    if (query.testId !== undefined && query.testId !== "") {
        if (!mongoose.Types.ObjectId.isValid(query.testId)) throw new Error("Invalid test ID");
        filters.testId = new mongoose.Types.ObjectId(query.testId);
    }
    if (query.status !== undefined && !["all", "pass", "fail"].includes(query.status)) {
        throw new Error("status must be all, pass, or fail");
    }
    filters.status = query.status ?? "all";

    for (const key of ["from", "to"]) {
        if (query[key] === undefined || query[key] === "") continue;
        const date = new Date(query[key]);
        if (!Number.isFinite(date.getTime())) throw new Error(`${key} must be a valid date`);
        if (key === "to" && /^\d{4}-\d{2}-\d{2}$/.test(query[key])) {
            date.setUTCHours(23, 59, 59, 999);
        }
        filters[key] = date;
    }
    if (filters.from && filters.to && filters.from > filters.to) {
        throw new Error("from must be earlier than or equal to to");
    }

    if (query.search !== undefined && typeof query.search !== "string") {
        throw new Error("search must be a string");
    }
    filters.search = query.search?.trim() ?? "";
    if (filters.search.length > 100) throw new Error("search must be 100 characters or fewer");
    filters.sortBy = query.sortBy ?? "submittedAt";
    if (!["submittedAt", "score"].includes(filters.sortBy)) {
        throw new Error("sortBy must be submittedAt or score");
    }
    filters.sortOrder = query.sortOrder ?? "desc";
    if (!["asc", "desc"].includes(filters.sortOrder)) {
        throw new Error("sortOrder must be asc or desc");
    }
    return filters;
};

export const completedSubmissionStages = (testIds, studentId) => [
    {
        $match: {
            test: { $in: testIds },
            submittedAt: { $type: "date" },
            score: { $type: "number", $gte: 0 },
            ...(studentId ? { student: studentId } : {}),
        },
    },
    {
        $lookup: {
            from: "tests",
            localField: "test",
            foreignField: "_id",
            as: "testRecord",
        },
    },
    { $unwind: "$testRecord" },
    {
        $lookup: {
            from: "users",
            localField: "student",
            foreignField: "_id",
            as: "studentRecord",
        },
    },
    { $unwind: "$studentRecord" },
    { $match: { "studentRecord.role": "student" } },
    {
        $set: {
            maximumScore: { $ifNull: ["$testSnapshot.totalMarks", null] },
            passPercentage: { $ifNull: ["$testSnapshot.passPercentage", 50] },
        },
    },
    {
        $match: {
            $expr: {
                $or: [
                    { $eq: ["$maximumScore", null] },
                    {
                        $and: [
                            { $isNumber: "$maximumScore" },
                            { $gte: ["$maximumScore", 0] },
                            { $lte: ["$score", "$maximumScore"] },
                        ],
                    },
                ],
            },
        },
    },
    {
        $set: {
            percentage: {
                $cond: [
                    {
                        $and: [
                            { $isNumber: "$maximumScore" },
                            { $gt: ["$maximumScore", 0] },
                            { $gte: ["$score", 0] },
                            { $lte: ["$score", "$maximumScore"] },
                        ],
                    },
                    { $multiply: [{ $divide: ["$score", "$maximumScore"] }, 100] },
                    null,
                ],
            },
        },
    },
    {
        $set: {
            _attemptOrder: {
                submittedAt: "$submittedAt",
                submissionId: "$_id",
            },
        },
    },
    {
        $setWindowFields: {
            partitionBy: { test: "$test", student: "$student" },
            sortBy: { _attemptOrder: 1 },
            output: { attemptNumber: { $documentNumber: {} } },
        },
    },
    {
        $set: {
            passed: {
                $cond: [
                    { $ne: ["$percentage", null] },
                    { $gte: ["$percentage", "$passPercentage"] },
                    null,
                ],
            },
        },
    },
];

export const reportFilterStages = (filters) => {
    const match = {};
    if (filters.from || filters.to) {
        match.submittedAt = {};
        if (filters.from) match.submittedAt.$gte = filters.from;
        if (filters.to) match.submittedAt.$lte = filters.to;
    }
    if (filters.status === "pass") match.passed = true;
    if (filters.status === "fail") match.passed = false;
    if (filters.search) {
        const search = { $regex: escapeRegex(filters.search), $options: "i" };
        match.$or = [
            { "studentRecord.name": search },
            { "studentRecord.email": search },
        ];
    }
    return Object.keys(match).length ? [{ $match: match }] : [];
};

export const resultSort = (filters) => {
    const direction = filters.sortOrder === "asc" ? 1 : -1;
    return filters.sortBy === "score"
        ? { percentage: direction, submittedAt: -1, _id: 1 }
        : { submittedAt: direction, _id: direction };
};

export const resultProjection = {
    _id: 1,
    testId: "$test",
    testName: { $ifNull: ["$testSnapshot.title", "$testRecord.title"] },
    student: {
        _id: "$studentRecord._id",
        name: "$studentRecord.name",
        email: "$studentRecord.email",
    },
    score: 1,
    maximumScore: 1,
    percentage: { $cond: [{ $ne: ["$percentage", null] }, { $round: ["$percentage", 1] }, null] },
    passed: 1,
    attemptNumber: 1,
    submittedAt: 1,
    timeTakenInSeconds: 1,
};

export const submissionDetailFromSnapshots = (submission) => {
    const answers = submission.answers || [];
    const questionSnapshots = submission.questionSnapshots?.length
        ? submission.questionSnapshots
        : answers
            .filter(answer => answer.questionSnapshot)
            .map(answer => ({
                question: answer.question,
                ...answer.questionSnapshot,
            }));
    const answerByQuestion = new Map(
        answers.map(answer => [String(answer.question), answer])
    );

    const questions = questionSnapshots.map(snapshot => {
        const questionId = String(snapshot.question);
        const answer = answerByQuestion.get(questionId);
        const awarded = answer
            ? gradeAttemptAnswers(
                [{ question: questionId, selected: answer.selected }],
                [snapshot]
            ).score
            : 0;
        const maximumMarks = snapshot.mark || 1;
        return {
            questionId,
            questionText: snapshot.questionText,
            options: snapshot.options,
            submittedAnswer: answer?.selected ?? null,
            correctAnswer: snapshot.correctOption ?? null,
            marksAwarded: awarded,
            maximumMarks,
            status: !answer ? "unanswered" : awarded > 0 ? "correct" : "incorrect",
        };
    });

    const testSnapshot = submission.testSnapshot || {};
    const maximumScore = Number.isFinite(testSnapshot.totalMarks) && testSnapshot.totalMarks > 0
        ? testSnapshot.totalMarks
        : null;
    const percentage = maximumScore === null
        ? null
        : (submission.score / maximumScore) * 100;
    const passPercentage = Number.isFinite(testSnapshot.passPercentage)
        ? testSnapshot.passPercentage
        : 50;

    return {
        _id: submission._id,
        student: submission.student,
        test: {
            _id: submission.test,
            title: testSnapshot.title ?? null,
            totalMarks: maximumScore,
            passPercentage,
            durationMinutes: testSnapshot.durationMinutes ?? null,
        },
        attemptNumber: submission.attemptNumber,
        startedAt: submission.startedAt ?? null,
        submittedAt: submission.submittedAt,
        score: submission.score,
        maximumScore,
        percentage: percentage === null ? null : Math.round(percentage * 10) / 10,
        passed: percentage === null ? null : percentage >= passPercentage,
        timeTakenInSeconds: submission.timeTakenInSeconds ?? null,
        questions,
    };
};

export const csvEscape = (value) => {
    let text = value == null ? "" : String(value);
    if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const reportCsvRow = (row) => [
    row.student?.name || row.student?.email || "",
    row.testName,
    row.attemptNumber,
    row.score,
    row.maximumScore,
    row.percentage,
    row.passed == null ? "" : row.passed ? "Pass" : "Fail",
    row.submittedAt?.toISOString?.() ?? row.submittedAt,
].map(csvEscape).join(",");
