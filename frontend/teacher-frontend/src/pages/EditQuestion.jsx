import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import Loading from "../components/Loading";
import "../assets/css/EditQuestion.css";
import { showError, showSuccess } from "../../../utils/utils";

export default function EditQuestion() {
  const { questionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [teachersError, setTeachersError] = useState("");

  const [form, setForm] = useState({
    questionText: "",
    options: { a: "", b: "", c: "", d: "" },
    correctOption: "",
    mark: "",
    difficulty: "medium",
    allowedTeachers: [],
  });

  useEffect(() => {
    fetchQuestion();
    fetchTeachers();
  }, []);

  const fetchQuestion = async () => {
    try {
      const res = await API.get(`/teacher/questions/${questionId}`);
      const q = res.data;
      if (!q.canEdit) {
        setError(q.protectionReason || "This question is not available for editing.");
        return;
      }
      setForm({
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption,
        mark: q.mark ?? "",
        difficulty: q.difficulty || "medium",
        allowedTeachers: q.allowedTeachers || [],
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load question.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await API.get("/teacher/users");
      setTeachers(res.data);
    } catch (err) {
      setTeachersError("Failed to load teachers");
    }
  };

  const toggleTeacher = (teacherId) => {
    setForm((prev) => {
      const alreadySelected = prev.allowedTeachers.includes(teacherId);

      return {
        ...prev,
        allowedTeachers: alreadySelected
          ? prev.allowedTeachers.filter((id) => id !== teacherId)
          : [...prev.allowedTeachers, teacherId],
      };
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleOptionChange = (key, value) => {
    setForm({
      ...form,
      options: { ...form.options, [key]: value },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const {data} = await API.put(`/teacher/questions/${questionId}`, { ...form, mark: Number(form.mark) });
      if (data.success) {
        showSuccess("Question updated successfully");
      }
      navigate("/questions")
    } catch (err) {
      const message = err.response?.data?.message || "Unable to update question.";
      if (err.response?.status === 409) setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) {
    return (
      <main className="main">
        <section className="question-empty-state" role="alert">
          <span className="question-empty-mark" aria-hidden="true">!</span>
          <div>
            <h2>Question unavailable</h2>
            <p>{error}</p>
          </div>
          <button className="button" type="button" onClick={() => navigate("/questions")}>Back to questions</button>
        </section>
      </main>
    );
  }

  return (
      <main className="main">
        <div className="edit-page question-editor-page">
            <div className="card edit-question-card">
                <button className="question-back" type="button" onClick={() => navigate("/questions")}>← Question bank</button>
                <div className="question-editor-heading">
                  <p className="page-eyebrow">Question bank</p>
                  <h1 className="page-title">Edit question</h1>
                  <p>Update the prompt, answer choices, or access settings.</p>
                </div>

                <form onSubmit={handleSubmit} className="question-form">
                
                <div className="form-group">
                    <label htmlFor="edit-question-text">Question</label>
                    <textarea
                    id="edit-question-text"
                    name="questionText"
                    value={form.questionText}
                    onChange={handleChange}
                    placeholder="Enter question text..."
                    required
                    />
                </div>

                <fieldset className="options-grid">
                    <legend>Answer choices</legend>
                    <p className="question-field-hint">The highlighted option is currently marked as correct.</p>
                    <div className="options-grid-content">
                    {["a", "b", "c", "d"].map((key) => (
                    <div
                        key={key}
                        className={`option-box ${
                        form.correctOption === key ? "correct" : ""
                        }`}
                    >
                        <label htmlFor={`edit-option-${key}`}>Option {key.toUpperCase()}</label>
                        <input
                        id={`edit-option-${key}`}
                        value={form.options[key]}
                        onChange={(e) => handleOptionChange(key, e.target.value)}
                        required
                        />
                    </div>
                    ))}
                    </div>
                </fieldset>

                <div className="form-group">
                        <label htmlFor="edit-question-mark">Marks</label>
                    <input
                          id="edit-question-mark"
                          type="number"
                      name="mark"
                      value={form.mark}
                      onChange={handleChange}
                      min="1"
                      required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="edit-question-difficulty">Difficulty</label>
                    <select
                    id="edit-question-difficulty"
                    name="difficulty"
                    value={form.difficulty}
                    onChange={handleChange}
                    required
                    >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="edit-correct-option">Correct answer</label>
                    <select
                    id="edit-correct-option"
                    name="correctOption"
                    value={form.correctOption}
                    onChange={handleChange}
                    required
                    >
                    <option value="">Select correct option</option>
                    <option value="a">Option A</option>
                    <option value="b">Option B</option>
                    <option value="c">Option C</option>
                    <option value="d">Option D</option>
                    </select>
                </div>

                <div className="form-group">
                  <div className="question-teacher-heading">
                    <label>Share with teachers <span>Optional</span></label>
                    <p>Choose colleagues who can use this question.</p>
                  </div>
                  <div className="teachers-list">
                    {teachers.map((t) => (
                      <button
                        key={t._id}
                        type="button"
                        className={`teacher-item ${
                          form.allowedTeachers.includes(t._id) ? "selected" : ""
                        }`}
                        onClick={() => toggleTeacher(t._id)}
                        aria-pressed={form.allowedTeachers.includes(t._id)}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                  {teachersError && <p className="page-feedback page-feedback-error" role="alert">{teachersError}</p>}
                </div>
                <div className="form-actions">
                    <button type="submit" className="btn primary" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                    </button>
                    <button
                    type="button"
                    className="btn ghost"
                    onClick={() => navigate("/questions")}
                    >
                    Cancel
                    </button>
                </div>

                </form>
            </div>
        </div>
      </main>
  );
}
