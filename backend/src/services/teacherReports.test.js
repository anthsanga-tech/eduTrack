import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Submission from "../models/Submission.js";
import TestModel from "../models/Test.js";
import User from "../models/User.js";
import teacherRoutes from "../routes/teacherRoutes.js";
import {
    completedSubmissionStages,
    csvEscape,
    parsePagination,
    parseReportFilters,
    reportCsvRow,
    reportFilterStages,
    resultSort,
    submissionDetailFromSnapshots,
} from "./teacherReports.js";
import {
    overviewPipeline,
    studentPerformancePipeline,
} from "../controllers/teacherReportsController.js";

const teacherId = new mongoose.Types.ObjectId();
const otherTeacherId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const ownTestId = new mongoose.Types.ObjectId();
const otherTestId = new mongoose.Types.ObjectId();
const submissionId = new mongoose.Types.ObjectId();

const response = () => ({
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
    setHeader(name, value) {
        this.headers[name] = value;
    },
});

const withTeacherApi = async (t, { aggregate = async () => [{ metadata: [], data: [] }] } = {}) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "teacher-reports-test-secret";
    t.after(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    });

    const users = new Map([
        [String(teacherId), { _id: teacherId, role: "teacher", tokenVersion: 0 }],
        [String(otherTeacherId), { _id: otherTeacherId, role: "teacher", tokenVersion: 0 }],
        [String(studentId), { _id: studentId, role: "student", tokenVersion: 0 }],
    ]);
    t.mock.method(User, "findById", id => ({
        select: async () => users.get(String(id)) || null,
    }));
    t.mock.method(TestModel, "distinct", async (field, filter) => {
        assert.equal(field, "_id");
        assert.equal(String(filter.teacher), String(teacherId));
        return [ownTestId];
    });
    t.mock.method(Submission, "aggregate", aggregate);

    const app = express();
    app.use("/api/teacher", teacherRoutes);
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.once("listening", resolve));
    const { port } = server.address();
    const request = (path, id, role) => fetch(`http://127.0.0.1:${port}/api/teacher${path}`, {
        headers: id ? {
            Authorization: `Bearer ${jwt.sign({ id, role, tokenVersion: 0 }, process.env.JWT_SECRET)}`,
        } : {},
    });
    return { request };
};

test("completed attempt numbering orders chronologically and breaks timestamp ties deterministically", () => {
    const stages = completedSubmissionStages([ownTestId], studentId);
    assert.deepEqual(stages[0].$match, {
        test: { $in: [ownTestId] },
        submittedAt: { $type: "date" },
        score: { $type: "number", $gte: 0 },
        student: studentId,
    });
    const rank = stages.find(stage => stage.$setWindowFields)?.$setWindowFields;
    assert.equal(Object.keys(rank.sortBy).length, 1);
    assert.deepEqual(rank.sortBy, { _attemptOrder: 1 });
    assert.deepEqual(rank.partitionBy, { test: "$test", student: "$student" });
    const completedFilterIndex = stages.indexOf(stages[0]);
    const compositeKeyStageIndex = stages.indexOf(stages.find(stage => stage.$set?._attemptOrder));
    const rankStageIndex = stages.indexOf(stages.find(stage => stage.$setWindowFields));
    assert.ok(completedFilterIndex < compositeKeyStageIndex);
    assert.ok(compositeKeyStageIndex < rankStageIndex);
    assert.deepEqual(stages[compositeKeyStageIndex].$set._attemptOrder, {
        submittedAt: "$submittedAt",
        submissionId: "$_id",
    });

    const sameTimestamp = new Date("2026-11-09T10:00:00.000Z");
    const attempts = [
        { _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439015"), submittedAt: new Date("2026-11-10T10:00:00.000Z") },
        { _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439014"), submittedAt: sameTimestamp },
        { _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"), submittedAt: null },
        { _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"), submittedAt: sameTimestamp },
        { _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"), submittedAt: new Date("2026-11-08T10:00:00.000Z") },
    ];
    const numbered = attempts
        .filter(attempt => attempt.submittedAt instanceof Date)
        .sort((left, right) =>
            left.submittedAt - right.submittedAt || String(left._id).localeCompare(String(right._id))
        )
        .map((attempt, index) => ({ id: String(attempt._id), attemptNumber: index + 1 }));
    assert.deepEqual(numbered, [
        { id: "507f1f77bcf86cd799439011", attemptNumber: 1 },
        { id: "507f1f77bcf86cd799439012", attemptNumber: 2 },
        { id: "507f1f77bcf86cd799439014", attemptNumber: 3 },
        { id: "507f1f77bcf86cd799439015", attemptNumber: 4 },
    ]);

    const percentage = stages.find(stage => stage.$set?.percentage).$set.percentage;
    assert.deepEqual(percentage.$cond[0], {
        $and: [
            { $isNumber: "$maximumScore" },
            { $gt: ["$maximumScore", 0] },
            { $gte: ["$score", 0] },
            { $lte: ["$score", "$maximumScore"] },
        ],
    });
    const passed = stages.find(stage => stage.$set?.passed).$set.passed.$cond;
    assert.deepEqual(passed[1], { $gte: ["$percentage", "$passPercentage"] });
});

test("overview and student summaries distinguish attempts from unique students and use attempt percentages", () => {
    const overviewStages = overviewPipeline([ownTestId]);
    const overviewStats = overviewStages.at(-1).$facet.stats[0].$group;
    assert.deepEqual(overviewStats.uniqueStudents, { $addToSet: "$studentRecord._id" });
    assert.deepEqual(overviewStats.totalAttempts, { $sum: 1 });
    assert.deepEqual(overviewStats.averageScore, { $avg: "$percentage" });
    assert.deepEqual(overviewStages[0].$match.submittedAt, { $type: "date" });

    const studentStages = studentPerformancePipeline([ownTestId], studentId, { skip: 0, limit: 10 });
    assert.equal(String(studentStages[0].$match.student), String(studentId));
    const summary = studentStages.at(-1).$facet.summary[0].$group;
    assert.deepEqual(summary.testIds, { $addToSet: "$test" });
    assert.deepEqual(summary.totalAttempts, { $sum: 1 });
    assert.deepEqual(summary.bestScore, { $max: "$percentage" });
    assert.deepEqual(summary.latestScore, { $last: "$percentage" });
});

test("report filtering escapes search input and applies pass/date filters", () => {
    const filters = parseReportFilters({
        status: "pass",
        search: "a+b",
        from: "2026-01-01",
        to: "2026-01-31",
    });
    const [stage] = reportFilterStages(filters);
    assert.equal(stage.$match.passed, true);
    assert.equal(stage.$match.submittedAt.$gte.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(stage.$match.submittedAt.$lte.toISOString(), "2026-01-31T23:59:59.999Z");
    assert.equal(stage.$match.$or[0]["studentRecord.name"].$regex, "a\\+b");
    assert.deepEqual(resultSort({ sortBy: "score", sortOrder: "asc" }), {
        percentage: 1,
        submittedAt: -1,
        _id: 1,
    });
});

test("pagination and query filters reject invalid inputs", () => {
    assert.deepEqual(parsePagination({ page: "2", limit: "50" }), {
        page: 2,
        limit: 50,
        skip: 50,
    });
    assert.throws(() => parsePagination({ page: "0" }), /page must be a positive integer/);
    assert.throws(() => parsePagination({ limit: "101" }), /limit must be an integer/);
    assert.throws(() => parseReportFilters({ status: "unknown" }), /status must be/);
    assert.throws(() => parseReportFilters({ sortBy: "name" }), /sortBy must be/);
    assert.throws(() => parseReportFilters({ testId: "not-an-id" }), /Invalid test ID/);
    assert.throws(() => parseReportFilters({ search: "x".repeat(101) }), /100 characters/);
});

test("submission details grade historical question snapshots and include unanswered questions", () => {
    const questionA = new mongoose.Types.ObjectId();
    const questionB = new mongoose.Types.ObjectId();
    const result = submissionDetailFromSnapshots({
        _id: submissionId,
        test: ownTestId,
        student: { _id: studentId, name: "Student", email: "student@example.test" },
        testSnapshot: { title: "Historical title", totalMarks: 5, passPercentage: 60 },
        score: 3,
        submittedAt: new Date("2026-11-01T00:00:00Z"),
        answers: [{ question: questionA, selected: "a" }],
        questionSnapshots: [
            {
                question: questionA,
                questionText: "Original question",
                options: { a: "Old correct answer", b: "Old choice" },
                correctOption: "a",
                mark: 3,
            },
            {
                question: questionB,
                questionText: "Unanswered question",
                options: { a: "Choice" },
                correctOption: "a",
                mark: 2,
            },
        ],
    });

    assert.equal(result.test.title, "Historical title");
    assert.equal(result.percentage, 60);
    assert.equal(result.passed, true);
    assert.deepEqual(result.questions.map(question => [
        question.status,
        question.marksAwarded,
        question.maximumMarks,
    ]), [["correct", 3, 3], ["unanswered", 0, 2]]);
});

test("CSV escaping quotes special characters and neutralizes spreadsheet formulas", () => {
    assert.equal(csvEscape('A,"B"\nC'), '"A,""B""\nC"');
    assert.equal(csvEscape('=SUM(1,2)'), `"'=SUM(1,2)"`);
    assert.equal(reportCsvRow({
        student: { name: "Student, One" },
        testName: "Final",
        attemptNumber: 2,
        score: 8,
        maximumScore: 10,
        percentage: 80,
        passed: true,
        submittedAt: new Date("2026-11-01T00:00:00.000Z"),
    }), '"Student, One",Final,2,8,10,80,Pass,2026-11-01T00:00:00.000Z');
});

test("report APIs require authentication and teacher role", async t => {
    const { request } = await withTeacherApi(t);
    assert.equal((await request("/reports/test-results", null)).status, 401);
    assert.equal((await request("/reports/test-results", studentId, "student")).status, 403);
});

test("result queries are scoped to authenticated teacher-owned tests", async t => {
    let pipeline;
    const { request } = await withTeacherApi(t, {
        aggregate: async stages => {
            pipeline = stages;
            return [{ metadata: [{ total: 0 }], data: [] }];
        },
    });
    const ownResponse = await request(
        `/reports/test-results?testId=${ownTestId}&page=1&limit=10`,
        teacherId,
        "teacher"
    );
    assert.equal(ownResponse.status, 200);
    assert.deepEqual(pipeline[0].$match.test.$in, [ownTestId]);
    assert.equal((await ownResponse.json()).pagination.total, 0);

    const foreignResponse = await request(
        `/reports/test-results?testId=${otherTestId}`,
        teacherId,
        "teacher"
    );
    assert.equal(foreignResponse.status, 404);
});

test("submission details are scoped to the teacher's own tests", async t => {
    let pipeline;
    const { request } = await withTeacherApi(t, {
        aggregate: async stages => {
            pipeline = stages;
            return [];
        },
    });
    const response = await request(
        `/reports/submissions/${submissionId}`,
        teacherId,
        "teacher"
    );
    assert.equal(response.status, 404);
    assert.deepEqual(pipeline[0].$match.test.$in, [ownTestId]);
});

test("student performance requests remain scoped to submissions from owned tests", async t => {
    let pipeline;
    const { request } = await withTeacherApi(t, {
        aggregate: async stages => {
            pipeline = stages;
            return [];
        },
    });
    const response = await request(
        `/reports/student-performance?studentId=${studentId}`,
        teacherId,
        "teacher"
    );
    assert.equal(response.status, 404);
    assert.deepEqual(pipeline[0].$match.test.$in, [ownTestId]);
    assert.equal(String(pipeline[0].$match.student), String(studentId));
});

test("CSV export streams the same owner-scoped filtered result set", async t => {
    let pipeline;
    const { request } = await withTeacherApi(t, {
        aggregate: stages => {
            pipeline = stages;
            return {
                cursor: () => (async function* () {
                    yield {
                        student: { name: "Student" },
                        testName: "Final",
                        attemptNumber: 1,
                        score: 5,
                        maximumScore: 10,
                        percentage: 50,
                        passed: true,
                        submittedAt: new Date("2026-11-01T00:00:00.000Z"),
                    };
                })(),
            };
        },
    });
    const response = await request(
        `/reports/export?testId=${ownTestId}&status=pass`,
        teacherId,
        "teacher"
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/csv/);
    assert.match(await response.text(), /Student,Final,1,5,10,50,Pass/);
    assert.deepEqual(pipeline[0].$match.test.$in, [ownTestId]);
    assert.ok(pipeline.some(stage => stage.$match?.passed === true));
});
