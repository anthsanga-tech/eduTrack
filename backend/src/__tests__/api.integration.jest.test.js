import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import adminRoutes from "../routes/adminRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import studentRoutes from "../routes/studentRoutes.js";
import teacherRoutes from "../routes/teacherRoutes.js";
import Question from "../models/Question.js";
import Subject from "../models/Subject.js";
import Submission from "../models/Submission.js";
import Test from "../models/Test.js";
import User from "../models/User.js";

process.env.JWT_SECRET = "eduTrack-api-tests-only";

const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/teacher", teacherRoutes);

let mongo;
let teacher;
let otherTeacher;
let student;
let admin;
let subject;

const tokenFor = user => jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET
);

const authenticated = user => ({ Authorization: `Bearer ${tokenFor(user)}` });

const createPublishedTest = async ({ allowRetake = false, maxAttempts = 1 } = {}) => {
    const question = await Question.create({
        subject: subject._id,
        questionText: "What is 2 + 2?",
        options: { a: "3", b: "4", c: "5", d: "6" },
        correctOption: "b",
        mark: 4,
        createdBy: teacher._id,
    });
    return Test.create({
        title: "Arithmetic",
        durationMinutes: 20,
        subject: subject._id,
        teacher: teacher._id,
        assignedStudents: [student._id],
        questions: [question._id],
        totalMarks: 4,
        status: "published",
        attemptRules: { allowRetake, maxAttempts },
    });
};

const submitAttempt = async (testId, selected = "b") => {
    const attemptResponse = await request(app)
        .post(`/api/student/tests/${testId}/attempt`)
        .set(authenticated(student));
    expect(attemptResponse.status).toBe(200);
    expect(attemptResponse.body.submissionId).toBeDefined();

    const question = await Question.findOne({ subject: subject._id });
    const response = await request(app)
        .post(`/api/student/tests/${testId}/submit`)
        .set(authenticated(student))
        .send({
            submissionId: attemptResponse.body.submissionId,
            answers: [{ question: question._id, selected }],
        });
    expect(response.status).toBe(200);
    expect(response.body.submittedId).toBe(attemptResponse.body.submissionId);
    return response.body.submittedId;
};

beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
});

beforeEach(async () => {
    await Promise.all(
        Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({}))
    );
    [teacher, otherTeacher, student, admin] = await User.create([
        { name: "Teacher", email: "teacher@example.test", password: "pass1234", role: "teacher" },
        { name: "Other Teacher", email: "other@example.test", password: "pass1234", role: "teacher" },
        { name: "Student", email: "student@example.test", password: "pass1234", role: "student" },
        { name: "Admin", email: "admin@example.test", password: "pass1234", role: "admin" },
    ]);
    subject = await Subject.create({ subjectName: "Mathematics", createdBy: teacher._id });
});

describe("auth and role-protected APIs", () => {
    it("authenticates with the requested role and rejects invalid credentials or role mismatch", async () => {
        const login = await request(app)
            .post("/api/auth/login")
            .send({ email: teacher.email, password: "pass1234", role: "teacher" });
        expect(login.status).toBe(200);
        expect(login.body).toMatchObject({ role: "teacher", email: teacher.email });
        expect(login.body.token).toEqual(expect.any(String));

        const wrongPassword = await request(app)
            .post("/api/auth/login")
            .send({ email: teacher.email, password: "wrong", role: "teacher" });
        expect(wrongPassword.status).toBe(401);
        expect(wrongPassword.body.message).toMatch(/Invalid email or password/);

        const wrongRole = await request(app)
            .post("/api/auth/login")
            .send({ email: teacher.email, password: "pass1234", role: "admin" });
        expect(wrongRole.status).toBe(403);
    });

    it("requires authentication and rejects student/admin roles on teacher endpoints", async () => {
        expect((await request(app).get("/api/teacher/tests")).status).toBe(401);
        expect((await request(app).get("/api/teacher/tests").set(authenticated(student))).status).toBe(403);
        expect((await request(app).get("/api/teacher/tests").set(authenticated(admin))).status).toBe(403);
        expect((await request(app).get("/api/teacher/tests").set(authenticated(teacher))).status).toBe(200);
    });

    it("allows administrators on admin routes and denies other roles", async () => {
        expect((await request(app).get("/api/admin/users").set(authenticated(admin))).status).toBe(200);
        expect((await request(app).get("/api/admin/users").set(authenticated(teacher))).status).toBe(403);
        expect((await request(app).get("/api/admin/users").set(authenticated(student))).status).toBe(403);
    });

    it("keeps test detail scoped to its owning teacher", async () => {
        const test = await Test.create({
            title: "Owner-only",
            durationMinutes: 20,
            subject: subject._id,
            teacher: teacher._id,
        });

        const ownTest = await request(app)
            .get(`/api/teacher/tests/${test._id}`)
            .set(authenticated(teacher));
        expect(ownTest.status).toBe(200);
        expect(ownTest.body.title).toBe("Owner-only");

        const foreignTest = await request(app)
            .get(`/api/teacher/tests/${test._id}`)
            .set(authenticated(otherTeacher));
        expect(foreignTest.status).toBe(404);
    });
});

describe("test management and student attempts", () => {
    it("creates and edits drafts, rejects direct lifecycle changes, and publishes only valid tests", async () => {
        const create = await request(app)
            .post("/api/teacher/tests")
            .set(authenticated(teacher))
            .send({
                title: "Draft",
                durationMinutes: 20,
                subject: subject._id,
                assignedStudents: [student._id],
            });
        expect(create.status).toBe(201);
        expect(create.body.test.status).toBe("drafted");
        const testId = create.body.test._id;

        const edit = await request(app)
            .put(`/api/teacher/tests/${testId}`)
            .set(authenticated(teacher))
            .send({ title: "Updated draft" });
        expect(edit.status).toBe(200);
        expect(edit.body.test.title).toBe("Updated draft");

        const directPublish = await request(app)
            .put(`/api/teacher/tests/${testId}`)
            .set(authenticated(teacher))
            .send({ status: "published" });
        expect(directPublish.status).toBe(400);

        const invalidPublish = await request(app)
            .patch(`/api/teacher/tests/${testId}/publish`)
            .set(authenticated(teacher));
        expect(invalidPublish.status).toBe(400);
        expect(invalidPublish.body.message).toMatch(/at least one question/);

        const question = await Question.create({
            subject: subject._id,
            questionText: "Question?",
            options: { a: "A", b: "B", c: "C", d: "D" },
            correctOption: "a",
            mark: 1,
            createdBy: teacher._id,
        });
        await Test.updateOne({ _id: testId }, { $set: { questions: [question._id], totalMarks: 1 } });
        const publish = await request(app)
            .patch(`/api/teacher/tests/${testId}/publish`)
            .set(authenticated(teacher));
        expect(publish.status).toBe(200);
        expect(publish.body.test.status).toBe("published");

        const publishedEdit = await request(app)
            .put(`/api/teacher/tests/${testId}`)
            .set(authenticated(teacher))
            .send({ title: "Changed after publish" });
        expect(publishedEdit.status).toBe(409);
    });

    it("submits and scores an attempt, then blocks a retake when disabled", async () => {
        const test = await createPublishedTest();
        const submissionId = await submitAttempt(test._id);
        const submission = await Submission.findById(submissionId);
        expect(submission).toMatchObject({ score: 4, correct: 1, wrong: 0 });

        const retake = await request(app)
            .post(`/api/student/tests/${test._id}/attempt`)
            .set(authenticated(student));
        expect(retake.status).toBe(403);
        expect(retake.body.message).toMatch(/Retakes are not allowed/);

        const results = await request(app)
            .get(`/api/teacher/reports/test-results?testId=${test._id}`)
            .set(authenticated(teacher));
        expect(results.status).toBe(200);
        expect(results.body).toMatchObject({
            pagination: { total: 1 },
        });
        expect(results.body.data[0]).toMatchObject({ score: 4, maximumScore: 4, passed: true });

        const csv = await request(app)
            .get(`/api/teacher/reports/export?testId=${test._id}`)
            .set(authenticated(teacher));
        expect(csv.status).toBe(200);
        expect(csv.headers["content-type"]).toMatch(/text\/csv/);
        expect(csv.text).toMatch(/Arithmetic/);
        expect(csv.text).toMatch(/Pass/);
    });

    it("reports a failed score below the test pass percentage", async () => {
        const test = await createPublishedTest();
        await submitAttempt(test._id, "a");

        const results = await request(app)
            .get(`/api/teacher/reports/test-results?testId=${test._id}&status=fail`)
            .set(authenticated(teacher));
        expect(results.status).toBe(200);
        expect(results.body.pagination.total).toBe(1);
        expect(results.body.data[0]).toMatchObject({ score: 0, percentage: 0, passed: false });
    });

    it("allows configured retakes up to the maximum attempt count", async () => {
        const test = await createPublishedTest({ allowRetake: true, maxAttempts: 2 });
        const firstSubmissionId = await submitAttempt(test._id);

        const firstRetake = await request(app)
            .post(`/api/student/tests/${test._id}/attempt`)
            .set(authenticated(student));
        expect(firstRetake.status).toBe(200);
        expect(firstRetake.body.submissionId).not.toBe(firstSubmissionId);

        const question = await Question.findOne({ subject: subject._id });
        const secondSubmit = await request(app)
            .post(`/api/student/tests/${test._id}/submit`)
            .set(authenticated(student))
            .send({
                submissionId: firstRetake.body.submissionId,
                answers: [{ question: question._id, selected: "a" }],
            });
        expect(secondSubmit.status).toBe(200);

        const overLimit = await request(app)
            .post(`/api/student/tests/${test._id}/attempt`)
            .set(authenticated(student));
        expect(overLimit.status).toBe(403);
        expect(overLimit.body.message).toMatch(/Maximum attempts reached/);

        const assignedTests = await request(app)
            .get("/api/student/tests")
            .set(authenticated(student));
        expect(assignedTests.status).toBe(200);
        expect(assignedTests.body[0].testAccess).toMatchObject({
            attemptCount: 2,
            attemptsLeft: 0,
            canAttempt: false,
            canRetake: false,
            canViewResult: true,
        });
    });
});
