import mongoose from "mongoose";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Submission from "../models/Submission.js";
import Test from "../models/Test.js";
import {
    completedSubmissionStages,
    parsePagination,
    parseReportFilters,
    reportCsvRow,
    reportFilterStages,
    resultProjection,
    resultSort,
    submissionDetailFromSnapshots,
} from "../services/teacherReports.js";

const getOwnedTestIds = async (teacherId, requestedTestId) => {
    const testIds = await Test.distinct("_id", { teacher: teacherId });
    if (requestedTestId) {
        const ownedTestId = testIds.find(id => String(id) === String(requestedTestId));
        if (!ownedTestId) return null;
        return [ownedTestId];
    }
    return testIds;
};

const parseRequest = (req, withPagination = false) => {
    const filters = parseReportFilters(req.query);
    const pagination = withPagination ? parsePagination(req.query) : null;
    return { filters, pagination };
};

const sendBadRequest = (res, error) =>
    res.status(400).json({ message: error.message });

const roundPercent = value =>
    value == null ? null : Math.round(value * 10) / 10;

export const overviewPipeline = (testIds) => [
    ...completedSubmissionStages(testIds),
    {
        $facet: {
            stats: [
                {
                    $group: {
                        _id: null,
                        uniqueStudents: { $addToSet: "$studentRecord._id" },
                        totalAttempts: { $sum: 1 },
                        averageScore: { $avg: "$percentage" },
                        scoredAttempts: {
                            $sum: { $cond: [{ $ne: ["$percentage", null] }, 1, 0] },
                        },
                        passed: { $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ["$passed", false] }, 1, 0] } },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        uniqueStudents: { $size: "$uniqueStudents" },
                        totalAttempts: 1,
                        averageScore: 1,
                        scoredAttempts: 1,
                        passed: 1,
                        failed: 1,
                        passRate: {
                            $cond: [
                                { $gt: ["$scoredAttempts", 0] },
                                { $multiply: [{ $divide: ["$passed", "$scoredAttempts"] }, 100] },
                                null,
                            ],
                        },
                    },
                },
            ],
            averageScoresByTest: [
                { $match: { percentage: { $ne: null } } },
                {
                    $group: {
                        _id: "$test",
                        testName: { $first: { $ifNull: ["$testSnapshot.title", "$testRecord.title"] } },
                        attempts: { $sum: 1 },
                        averageScore: { $avg: "$percentage" },
                        bestScore: { $max: "$percentage" },
                    },
                },
                { $sort: { averageScore: -1, _id: 1 } },
            ],
            recentSubmissions: [
                { $sort: { submittedAt: -1, _id: -1 } },
                { $limit: 10 },
                { $project: resultProjection },
            ],
        },
    },
];

export const getReportsOverview = async (req, res) => {
    try {
        const testIds = await getOwnedTestIds(req.user._id);
        const [result = {}] = await Submission.aggregate(overviewPipeline(testIds));
        const rawStats = result.stats?.[0] || {};
        const averageScoresByTest = (result.averageScoresByTest || []).map(test => ({
            ...test,
            averageScore: roundPercent(test.averageScore),
            bestScore: roundPercent(test.bestScore),
        }));
        const stats = {
            uniqueStudents: rawStats.uniqueStudents ?? 0,
            totalAttempts: rawStats.totalAttempts ?? 0,
            averageScore: roundPercent(rawStats.averageScore),
            passRate: roundPercent(rawStats.passRate),
            passed: rawStats.passed ?? 0,
            failed: rawStats.failed ?? 0,
            scoredAttempts: rawStats.scoredAttempts ?? 0,
        };
        return res.json({
            data: {
                stats,
                passFailDistribution: {
                    passed: stats.passed,
                    failed: stats.failed,
                    unscored: stats.totalAttempts - stats.scoredAttempts,
                },
                averageScoresByTest,
                highestPerformingTest: averageScoresByTest[0] ?? null,
                lowestPerformingTest: averageScoresByTest.at(-1) ?? null,
                recentSubmissions: result.recentSubmissions || [],
            },
        });
    } catch (error) {
        console.error("getReportsOverview:", error);
        return res.status(500).json({ message: "Failed to load reporting overview" });
    }
};

export const getTestResults = async (req, res) => {
    let filters;
    let pagination;
    try {
        ({ filters, pagination } = parseRequest(req, true));
    } catch (error) {
        return sendBadRequest(res, error);
    }

    try {
        const testIds = await getOwnedTestIds(req.user._id, filters.testId);
        if (testIds === null) return res.status(404).json({ message: "Test not found" });
        const [result = { metadata: [], data: [] }] = await Submission.aggregate([
            ...completedSubmissionStages(testIds),
            ...reportFilterStages(filters),
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $sort: resultSort(filters) },
                        { $skip: pagination.skip },
                        { $limit: pagination.limit },
                        { $project: resultProjection },
                    ],
                },
            },
        ]);
        const total = result.metadata[0]?.total ?? 0;
        return res.json({
            data: result.data,
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total,
                totalPages: Math.ceil(total / pagination.limit),
            },
        });
    } catch (error) {
        console.error("getTestResults:", error);
        return res.status(500).json({ message: "Failed to load test results" });
    }
};

export const studentPerformancePipeline = (testIds, studentId, pagination) => [
    ...completedSubmissionStages(testIds, studentId),
    { $sort: { submittedAt: 1, _id: 1 } },
    {
        $facet: {
            summary: [
                {
                    $group: {
                        _id: null,
                        student: { $first: "$studentRecord" },
                        testIds: { $addToSet: "$test" },
                        totalAttempts: { $sum: 1 },
                        averageScore: { $avg: "$percentage" },
                        bestScore: { $max: "$percentage" },
                        latestScore: { $last: "$percentage" },
                        scoredAttempts: {
                            $sum: { $cond: [{ $ne: ["$percentage", null] }, 1, 0] },
                        },
                        passed: { $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ["$passed", false] }, 1, 0] } },
                        failedTestIds: {
                            $addToSet: {
                                $cond: [{ $eq: ["$passed", false] }, "$test", null],
                            },
                        },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        student: {
                            _id: "$student._id",
                            name: "$student.name",
                            email: "$student.email",
                        },
                        totalTests: { $size: "$testIds" },
                        totalAttempts: 1,
                        averageScore: 1,
                        bestScore: 1,
                        latestScore: 1,
                        passed: 1,
                        failed: 1,
                        failedTests: {
                            $size: { $setDifference: ["$failedTestIds", [null]] },
                        },
                        passRate: {
                            $cond: [
                                { $gt: ["$scoredAttempts", 0] },
                                { $multiply: [{ $divide: ["$passed", "$scoredAttempts"] }, 100] },
                                null,
                            ],
                        },
                    },
                },
            ],
            testPerformance: [
                {
                    $group: {
                        _id: "$test",
                        testName: { $first: { $ifNull: ["$testSnapshot.title", "$testRecord.title"] } },
                        attempts: { $sum: 1 },
                        averageScore: { $avg: "$percentage" },
                        bestScore: { $max: "$percentage" },
                        latestScore: { $last: "$percentage" },
                        scoredAttempts: {
                            $sum: { $cond: [{ $ne: ["$percentage", null] }, 1, 0] },
                        },
                        passed: { $sum: { $cond: [{ $eq: ["$passed", true] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ["$passed", false] }, 1, 0] } },
                    },
                },
                {
                    $set: {
                        passRate: {
                            $cond: [
                                { $gt: ["$scoredAttempts", 0] },
                                { $multiply: [{ $divide: ["$passed", "$scoredAttempts"] }, 100] },
                                null,
                            ],
                        },
                    },
                },
                { $sort: { testName: 1, _id: 1 } },
            ],
            history: [
                { $skip: pagination.skip },
                { $limit: pagination.limit },
                { $project: resultProjection },
            ],
        },
    },
];

export const getStudentPerformance = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.query.studentId)) {
        return res.status(400).json({ message: "A valid studentId is required" });
    }

    let pagination;
    try {
        pagination = parsePagination(req.query);
    } catch (error) {
        return sendBadRequest(res, error);
    }

    try {
        const testIds = await getOwnedTestIds(req.user._id);
        const studentId = new mongoose.Types.ObjectId(req.query.studentId);
        const [result = {}] = await Submission.aggregate(
            studentPerformancePipeline(testIds, studentId, pagination)
        );
        if (!result.summary?.length) {
            return res.status(404).json({ message: "Student performance not found" });
        }

        const summary = result.summary[0];
        const testPerformance = (result.testPerformance || []).map(test => ({
            ...test,
            averageScore: roundPercent(test.averageScore),
            bestScore: roundPercent(test.bestScore),
            latestScore: roundPercent(test.latestScore),
            passRate: roundPercent(test.passRate),
        }));
        const student = summary.student;
        return res.json({
            data: {
                student,
                summary: {
                    ...summary,
                    averageScore: roundPercent(summary.averageScore),
                    bestScore: roundPercent(summary.bestScore),
                    latestScore: roundPercent(summary.latestScore),
                    passRate: roundPercent(summary.passRate),
                },
                testPerformance,
                history: result.history,
            },
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total: summary.totalAttempts,
                totalPages: Math.ceil(summary.totalAttempts / pagination.limit),
            },
        });
    } catch (error) {
        console.error("getStudentPerformance:", error);
        return res.status(500).json({ message: "Failed to load student performance" });
    }
};

export const getSubmissionDetails = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.submissionId)) {
        return res.status(400).json({ message: "Invalid submission ID" });
    }
    try {
        const testIds = await getOwnedTestIds(req.user._id);
        const [submission] = await Submission.aggregate([
            ...completedSubmissionStages(testIds),
            { $match: { _id: new mongoose.Types.ObjectId(req.params.submissionId) } },
            {
                $project: {
                    _id: 1,
                    test: 1,
                    student: {
                        _id: "$studentRecord._id",
                        name: "$studentRecord.name",
                        email: "$studentRecord.email",
                    },
                    answers: 1,
                    questionSnapshots: 1,
                    testSnapshot: 1,
                    score: 1,
                    timeTakenInSeconds: 1,
                    startedAt: 1,
                    submittedAt: 1,
                    attemptNumber: 1,
                },
            },
        ]);
        if (!submission) return res.status(404).json({ message: "Submission not found" });
        return res.json({ data: submissionDetailFromSnapshots(submission) });
    } catch (error) {
        console.error("getSubmissionDetails:", error);
        return res.status(500).json({ message: "Failed to load submission details" });
    }
};

const csvStream = async function* (cursor) {
    yield "Student,Test,Attempt,Score,Maximum score,Percentage,Pass/fail,Submission date\r\n";
    for await (const row of cursor) yield `${reportCsvRow(row)}\r\n`;
};

export const exportTestResults = async (req, res) => {
    let filters;
    try {
        ({ filters } = parseRequest(req));
    } catch (error) {
        return sendBadRequest(res, error);
    }

    try {
        const testIds = await getOwnedTestIds(req.user._id, filters.testId);
        if (testIds === null) return res.status(404).json({ message: "Test not found" });
        const cursor = Submission.aggregate([
            ...completedSubmissionStages(testIds),
            ...reportFilterStages(filters),
            { $sort: resultSort(filters) },
            { $project: resultProjection },
        ]).cursor({ batchSize: 500 });

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="teacher-test-results.csv"');
        await pipeline(Readable.from(csvStream(cursor)), res);
    } catch (error) {
        console.error("exportTestResults:", error);
        if (!res.headersSent) return res.status(500).json({ message: "Failed to export test results" });
        res.destroy(error);
    }
};
