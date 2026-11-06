import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
    {
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
        },

        questionText: {
            type: String,
            required: true,
            default: 1,
        },

        options: {
            a: { type: String, required: true },
            b: { type: String, required: true },
            c: { type: String, required: true },
            d: { type: String, required: true },
        },

        correctOption: {
            type: String,
            enum: ["a", "b", "c", "d"],
            required: true,
        },

        mark: {
            type: Number,
            required: true,
        },

        difficulty: {
            type: String,
            enum: ["easy", "medium", "hard"],
            default: "medium",
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        isLocked: {
            type: Boolean,
            default: false,
        },

        isSystemProtected: {
            type: Boolean,
            default: false,
        },

        lockedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        lockedAt: {
            type: Date,
            default: null,
        },

        allowedTeachers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
        ],
    },
    { timestamps: true }
);

const Question = mongoose.model("Question", questionSchema);
export default Question;
