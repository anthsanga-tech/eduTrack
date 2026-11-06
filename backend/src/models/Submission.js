import mongoose from "mongoose";

const answerSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  selected: { type: String, enum: ["a","b","c","d"], required: true },
  questionSnapshot: {
    questionText: String,
    options: {
      a: String,
      b: String,
      c: String,
      d: String,
    },
    correctOption: { type: String, enum: ["a", "b", "c", "d"] },
    mark: Number,
    difficulty: { type: String, enum: ["easy", "medium", "hard"] },
  },
});

const questionSnapshotSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  questionText: String,
  options: {
    a: String,
    b: String,
    c: String,
    d: String,
  },
  correctOption: { type: String, enum: ["a", "b", "c", "d"] },
  mark: Number,
  difficulty: { type: String, enum: ["easy", "medium", "hard"] },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  test: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  answers: [answerSchema],
  questionSnapshots: { type: [questionSnapshotSchema], default: [] },
  testSnapshot: {
    title: String,
    totalMarks: Number,
    passPercentage: Number,
    durationMinutes: Number,
  },
  correct: { type: Number, default: 0 },
  wrong: { type: Number, default: 0 },
  startedAt: { type: Date },
  timeTakenInSeconds: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  submittedAt: { type: Date, default: null }
});

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;
