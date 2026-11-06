import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "mixed"],
      default: "medium",
    },
    difficultyTags: {
      type: [{ type: String, enum: ["easy", "medium", "hard"] }],
      default: [],
    },

    dueDate: Date,

    durationMinutes: {
      type: Number,
      required: true,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isLocked: {
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

    assignedStudents: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],

    questions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
    ],

    status: {
      type: String,
      enum: ["drafted", "draft", "published", "closed"],
      default: "drafted",
    },

    startTime: Date,

    // ✅ optional but useful for scoring system
    totalMarks: {
      type: Number,
      default: 0,
    },

    passPercentage: {
      type: Number,
      default: 50
    },

    // ✅ controls student behavior
    attemptRules: {
      allowRetake: {
        type: Boolean,
        default: false,
      },
      maxAttempts: {
        type: Number,
        default: 1,
      },
    },
  },
  { timestamps: true }
);

testSchema.virtual("totalQuestions").get(function () {
  return this.questions?.length || 0;
});

testSchema.set("toJSON", { virtuals: true });
testSchema.set("toObject", { virtuals: true });

const Test = mongoose.model("Test", testSchema); 
export default Test