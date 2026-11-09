import { useEffect, useState } from "react";
import API from "../services/api";
import "../assets/css/CreateTest.css";
import { useNavigate, useParams } from "react-router-dom";
import { showSuccess, showError } from "../../../utils/utils";
import Loading from "../components/Loading.jsx";
import { getTestLifecycleActions, getTestLifecycleStatus, getTestStatusChoices } from "../utils/testLifecycle.js";

export default function EditTest() {
  const navigate = useNavigate();
  const { testId } = useParams();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [difficultyTags, setDifficultyTags] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("drafted");
  const [lifecycleTest, setLifecycleTest] = useState(null);
  const [canPublish, setCanPublish] = useState(false);
  const [publishProtectionReason, setPublishProtectionReason] = useState("");

  const [startTime, setStartTime] = useState('');
  const [allowRetake, setAllowRetake] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(1);


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => { 
    try {
      setError("");
      setLoading(true);
      const [testRes, studentsRes, subjectsRes] = await Promise.all([
        API.get(`/teacher/tests/${testId}`),
        API.get("/teacher/tests/students"),
        API.get("/teacher/subjects")
      ]);

      const test = testRes.data;
      const currentStatus = getTestLifecycleStatus(test);
      setStatus(currentStatus);
      setCanPublish(Boolean(test.canPublish));
      setPublishProtectionReason(test.publishProtectionReason || "");
      if (!getTestLifecycleActions(test).canEdit) {
        if (currentStatus === "published" || currentStatus === "closed") {
          setLifecycleTest(test);
          return;
        }
        setError(test.editProtectionReason || "This test is read-only.");
        return;
      }

      setLifecycleTest(null);
      setTitle(test.title);
      setDescription(test.description || "");
      setDifficulty(test.difficulty || "medium");
      setDifficultyTags(test.difficultyTags || []);
      setDueDate(
        test.dueDate
          ? new Date(test.dueDate).toISOString().split("T")[0]
          : ""
      );
      setSelectedSubject(test.subject?._id || "");
      setDurationMinutes(test.durationMinutes || "");

      setStartTime(test.startTime ? new Date(test.startTime).toISOString().slice(0,16) : '');
      setAllowRetake(!!test.attemptRules?.allowRetake);
      setMaxAttempts(test.attemptRules?.maxAttempts ?? 1);

      setSelectedStudents(
        test.assignedStudents?.map(s => s._id) || []
      );

      setStudents(studentsRes.data);
      setSubjects(subjectsRes.data);

    } catch (err) {
      setError(err.response?.data?.message || "Failed to load test data");
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = (id) => {
    setSelectedStudents(prev =>
      prev.includes(id)
        ? prev.filter(sid => sid !== id)
        : [...prev, id]
    );
  };
  const visibleStudents = students.filter((student) =>
    student.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const submitHandler = async () => {
    if (difficulty === "mixed" && difficultyTags.length < 2) {
      showError("Select at least two difficulty tags for a mixed test");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        title,
        description,
        difficulty,
        difficultyTags,
        dueDate,
        durationMinutes: Number(durationMinutes),
        subject: selectedSubject,
        assignedStudents: selectedStudents,
        startTime: startTime ? new Date(startTime).toISOString() : null,
        attemptRules: { allowRetake, maxAttempts: Number(maxAttempts) }
      };

      const { data } = await API.put(`/teacher/tests/${testId}`, payload);

      if(data.success){
        if (status === "published") {
          try {
            const publishResponse = await API.patch(`/teacher/tests/${testId}/publish`);
            showSuccess(publishResponse.data.message || "Test published successfully");
            navigate("/tests");
            return;
          } catch (publishError) {
            setStatus("drafted");
            showError(publishError.response?.data?.message || "Test details were saved as a draft, but the test could not be published.");
            return;
          }
        }
        showSuccess("Test updated successfully");
        navigate("/tests");
      }
    } catch (err) {
      showError(err.response?.data?.message || "Unable to update test.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitLifecycleStatus = async () => {
    if (status !== "closed" || !lifecycleTest?.canClose || saving) return;
    try {
      setSaving(true);
      const { data } = await API.patch(`/teacher/tests/${testId}/close`);
      showSuccess(data.message || "Test closed successfully");
      navigate("/tests");
    } catch (statusError) {
      setStatus("published");
      showError(statusError.response?.data?.message || "Unable to close this test.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (lifecycleTest) {
    const statusChoices = getTestStatusChoices(status, {
      canPublish: lifecycleTest.canPublish,
      canClose: lifecycleTest.canClose,
    });
    return (
      <main className="main">
        <div className="assessment-page max-w-5xl mx-auto p-6 bg-slate-50 min-h-screen">
          <div className="assessment-page-header">
            <button className="assessment-back-link" type="button" onClick={() => navigate("/tests")}>
              ← My tests
            </button>
            <div>
              <p className="page-eyebrow">Assessment lifecycle</p>
              <h1>{lifecycleTest.title}</h1>
              <p>Published and closed tests are read-only. Use the status control for permitted lifecycle transitions.</p>
            </div>
          </div>
          <section className="assessment-details-panel space-y-6 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="assessment-panel-heading">
              <h2>Test status</h2>
              <p>Publishing and closing use the backend lifecycle checks; a closed test cannot be reopened.</p>
            </div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="test-status">
              Status
              <select
                id="test-status"
                className="mt-1 w-full border rounded-lg p-2.5 bg-white"
                value={status}
                onChange={event => setStatus(event.target.value)}
              >
                {statusChoices.map(choice => (
                  <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>
                ))}
              </select>
            </label>
            {status === "published" && !lifecycleTest.canClose && (
              <p className="text-sm text-amber-700" role="status">
                This test cannot be closed while an attempt is in progress.
              </p>
            )}
            {status === "closed" && lifecycleTest.canClose && (
              <button className="button" type="button" onClick={submitLifecycleStatus} disabled={saving}>
                {saving ? "Closing…" : "Close test"}
              </button>
            )}
          </section>
        </div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="main">
        <section className="question-empty-state" role="alert">
          <span className="question-empty-mark" aria-hidden="true">!</span>
          <div>
            <h2>Test details unavailable</h2>
            <p>{error}</p>
          </div>
          <button className="button" type="button" onClick={fetchData}>Try again</button>
        </section>
      </main>
    );
  }

  return (
    <div className="assessment-page max-w-5xl mx-auto p-6 bg-slate-50 min-h-screen">
      <div className="assessment-page-header">
        <button className="assessment-back-link" type="button" onClick={() => navigate("/tests")}>
          ← My tests
        </button>
        <div>
          <p className="page-eyebrow">Assessment builder</p>
          <h1>Edit test</h1>
          <p>Update the assessment details, schedule, and student access.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="assessment-details-panel lg:col-span-2 space-y-6 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="assessment-panel-heading">
            <h2>Test details</h2>
            <p>Keep the instructions and schedule up to date.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-status">Status</label>
            <select
              id="test-status"
              className="w-full border rounded-lg p-2.5 bg-white"
              value={status}
              onChange={event => setStatus(event.target.value)}
            >
              {getTestStatusChoices(status, { canPublish }).map(choice => (
                <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {canPublish
                ? "Publishing makes the test immutable. Closing is available after publishing."
                : publishProtectionReason || "This test cannot be published in its current state."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-title">Title</label>
            <input
              id="test-title"
              type="text"
              placeholder="Enter test title"
              className="w-full border rounded-lg p-2.5"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-description">Description</label>
            <textarea
              id="test-description"
              placeholder="Describe the test"
              rows={3}
              className="w-full border rounded-lg p-2.5"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-difficulty">Difficulty</label>
            <select
              id="test-difficulty"
              className="w-full border rounded-lg p-2.5 bg-white"
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Difficult</option>
              <option value="mixed">Mixed</option>
            </select>
            {difficulty === "mixed" && (
              <fieldset className="mt-3 flex flex-wrap gap-4">
                <legend className="mb-2 text-sm text-slate-600">Select at least two difficulty tags</legend>
                {[
                  ["easy", "Easy"],
                  ["medium", "Medium"],
                  ["hard", "Difficult"],
                ].map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={difficultyTags.includes(value)}
                      onChange={() => setDifficultyTags(current => current.includes(value)
                        ? current.filter(tag => tag !== value)
                        : [...current, value])}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-start-time">Start time</label>
              <input
                id="test-start-time"
                type="datetime-local"
                className="w-full border rounded-lg p-2.5 text-sm"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-due-date">Due date</label>
              <input
                id="test-due-date"
                type="date"
                className="w-full border rounded-lg p-2.5 text-sm"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-duration">Duration (minutes)</label>
              <input
                id="test-duration"
                type="number"
                min="1"
                placeholder="60"
                className="w-full border rounded-lg p-2.5"
                value={durationMinutes}
                onChange={e => setDurationMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="assessment-retake-settings p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={allowRetake}
                onChange={e => setAllowRetake(e.target.checked)}
              />
              <span className="text-sm font-medium text-slate-700">Allow Retakes</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Max attempts:</span>
              <input
                type="number"
                min={1}
                className="w-16 border rounded-lg p-1.5 text-center"
                value={maxAttempts}
                disabled={!allowRetake}
                onChange={e => setMaxAttempts(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="assessment-side-column space-y-6">
          <div className="assessment-side-panel bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="assessment-panel-heading">
              <h2>Subject</h2>
              <p>Select one subject for this test.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {subjects.map(subject => (
                <button
                  key={subject._id}
                  className={`text-sm subject-card ${selectedSubject === subject._id ? "active" : ""}`}
                  onClick={() => setSelectedSubject(subject._id)}
                  type="button"
                  aria-pressed={selectedSubject === subject._id}
                >
                  {subject.subjectName}
                </button>
              ))}
            </div>
          </div>

          <div className="assessment-side-panel bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="assessment-panel-heading">
              <h2>Assign students</h2>
              <p>{selectedStudents.length} selected</p>
            </div>
            <input
              type="text"
              placeholder="Search students..."
              className="w-full border rounded-lg p-2 text-sm mb-3"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              aria-label="Search students"
            />
            <div className="students-list">
              {visibleStudents.length ? visibleStudents.map(s => (
                <button
                  key={s._id}
                  className={`student-item text-sm ${selectedStudents.includes(s._id) ? "selected" : ""}`}
                  onClick={() => toggleStudent(s._id)}
                  type="button"
                  aria-pressed={selectedStudents.includes(s._id)}
                >
                  {s.name}
                </button>
              )) : <p className="selection-empty">No students match your search.</p>}
            </div>
          </div>

          <button
            onClick={submitHandler}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-xl shadow-sm transition"
          >
            {saving ? "Updating..." : "Update Test"}
          </button>
        </div>
      </div>
    </div>
  );
}