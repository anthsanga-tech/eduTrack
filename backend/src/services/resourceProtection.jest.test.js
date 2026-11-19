import { describe, expect, it } from "@jest/globals";
import mongoose from "mongoose";
import Question from "../models/Question.js";
import Test from "../models/Test.js";
import {
    canEditTest,
    getTestAttemptEligibility,
    getTestPublicationValidationError,
    gradeAttemptAnswers,
} from "./resourceProtection.js";

describe("test and attempt business rules", () => {
    it("grades correct and incorrect answers against the attempt snapshot", () => {
        const questionId = new mongoose.Types.ObjectId();
        const result = gradeAttemptAnswers(
            [
                { question: questionId, selected: "b" },
                { question: new mongoose.Types.ObjectId(), selected: "c" },
            ],
            [{
                question: questionId,
                correctOption: "b",
                mark: 3,
                questionText: "Snapshot question",
                options: { a: "A", b: "B", c: "C", d: "D" },
            }]
        );

        expect(result).toMatchObject({ score: 3, correct: 1, wrong: 1 });
        expect(result.answerSnapshots[0].questionSnapshot.questionText).toBe("Snapshot question");
        expect(result.answerSnapshots[1]).toBeNull();
    });

    it("allows an initial attempt, enforces the retake flag, and caps retakes", () => {
        expect(getTestAttemptEligibility(0, { maxAttempts: 2, allowRetake: false })).toEqual({
            maxAttempts: 2,
            attemptsLeft: 2,
            canAttempt: true,
            canRetake: false,
        });
        expect(getTestAttemptEligibility(1, { maxAttempts: 2, allowRetake: false }).canAttempt).toBe(false);
        expect(getTestAttemptEligibility(1, { maxAttempts: 2, allowRetake: true })).toMatchObject({
            attemptsLeft: 1,
            canAttempt: true,
            canRetake: true,
        });
        expect(getTestAttemptEligibility(2, { maxAttempts: 2, allowRetake: true })).toMatchObject({
            attemptsLeft: 0,
            canAttempt: false,
            canRetake: false,
        });
    });

    it("requires complete, consistent test data before publishing", () => {
        const validTest = {
            title: "Final",
            subject: new mongoose.Types.ObjectId(),
            durationMinutes: 30,
            questions: [new mongoose.Types.ObjectId()],
            assignedStudents: [new mongoose.Types.ObjectId()],
            difficulty: "medium",
        };
        expect(getTestPublicationValidationError(validTest)).toBeNull();
        expect(getTestPublicationValidationError({ ...validTest, questions: [] })).toMatch(/at least one question/);
        expect(getTestPublicationValidationError({ ...validTest, assignedStudents: [] })).toMatch(/Assign at least one student/);
        expect(getTestPublicationValidationError({
            ...validTest,
            difficulty: "mixed",
            difficultyTags: ["easy", "easy"],
        })).toMatch(/two unique difficulty tags/);
        expect(getTestPublicationValidationError({
            ...validTest,
            startTime: "2026-01-02T00:00:00Z",
            dueDate: "2026-01-01T00:00:00Z",
        })).toMatch(/due date must be after/);
    });

    it("restricts editing to the owning teacher's unlocked draft without records", () => {
        const teacherId = new mongoose.Types.ObjectId();
        const test = { teacher: teacherId, status: "drafted", isLocked: false };
        expect(canEditTest(test, {}, teacherId)).toBe(true);
        expect(canEditTest(test, { hasAttempts: true }, teacherId)).toBe(false);
        expect(canEditTest(test, {}, new mongoose.Types.ObjectId())).toBe(false);
        expect(canEditTest({ ...test, isLocked: true }, {}, teacherId)).toBe(false);
    });
});

describe("question and test schema validation", () => {
    it("rejects a question with missing required options and an invalid answer key", () => {
        const question = new Question({
            subject: new mongoose.Types.ObjectId(),
            questionText: "Choose an answer",
            options: { a: "A", b: "B" },
            correctOption: "e",
            mark: 1,
            createdBy: new mongoose.Types.ObjectId(),
        });

        const error = question.validateSync();
        expect(error.errors["options.c"]).toBeDefined();
        expect(error.errors["options.d"]).toBeDefined();
        expect(error.errors.correctOption).toBeDefined();
    });

    it("requires the test duration, subject, and owning teacher", () => {
        const test = new Test({ title: "Incomplete" });
        const error = test.validateSync();
        expect(error.errors.durationMinutes).toBeDefined();
        expect(error.errors.subject).toBeDefined();
        expect(error.errors.teacher).toBeDefined();
    });
});
