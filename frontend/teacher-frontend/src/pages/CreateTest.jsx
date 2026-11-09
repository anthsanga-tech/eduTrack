import { useEffect, useState } from "react";
import API from "../services/api";
import "../assets/css/CreateTest.css";
import { useNavigate } from "react-router-dom";
import { showSuccess, showError } from "../../../utils/utils";
import { getTestStatusChoices } from "../utils/testLifecycle.js";

export default function CreateTest() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [status, setStatus] = useState("drafted");
  const [difficultyTags, setDifficultyTags] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");

  const [startTime, setStartTime] = useState(''); // ISO datetime-local string
  const [allowRetake, setAllowRetake] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(1);

  useEffect(() => {
    API.get("/teacher/tests/students").then(res => setStudents(res.data)).catch(err => console.error(err));
    API.get("/teacher/subjects").then(res => setSubjects(res.data)).catch(err => console.error(err));
  }, []);

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

    const payload = {
      title,
      description,
      difficulty,
      difficultyTags,
      status,
      dueDate,
      durationMinutes: Number(durationMinutes),
      subject: selectedSubject,
      assignedStudents: selectedStudents,
      startTime: startTime ? new Date(startTime).toISOString() : null,
      attemptRules: { allowRetake, maxAttempts: Number(maxAttempts) }
    };

    const { data } = await API.post("/teacher/tests", payload);
    if (data.success) {
      showSuccess(data.message);
    } else {
      showError("Failed to create test");
      console.error(data.message);
    }
    navigate("/tests");
  };

  return (
    <div className="assessment-page max-w-5xl mx-auto p-6 bg-slate-50 min-h-screen">
  {/* Header */}
  <div className="assessment-page-header">
    <button className="assessment-back-link" type="button" onClick={() => navigate("/tests")}>
      ← My tests
    </button>
    <div>
      <p className="page-eyebrow">Assessment builder</p>
      <h1>Create a test</h1>
      <p>Set up the assessment, choose its subject, and assign students.</p>
    </div>
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    
    {/* Left Column: Basic Info & Settings (2 cols) */}
    <div className="assessment-details-panel lg:col-span-2 space-y-6 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
      <div className="assessment-panel-heading">
        <h2>Test details</h2>
        <p>Give students the information they need before they begin.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-status">Status</label>
        <select
          id="test-status"
          className="w-full border rounded-lg p-2.5 bg-white"
          value={status}
          onChange={event => setStatus(event.target.value)}
        >
          {getTestStatusChoices("drafted").map(choice => (
            <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          New tests start as drafts. Add questions before publishing; closed is only available after a test is published.
        </p>
      </div>
      
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-title">Title</label>
        <input id="test-title" type="text" placeholder="e.g. Algebra unit assessment" className="w-full border rounded-lg p-2.5" value={title} onChange={e => setTitle(e.target.value)}/>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-description">Description</label>
        <textarea id="test-description" placeholder="Add instructions or a short overview for students" rows={3} className="w-full border rounded-lg p-2.5" value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-difficulty">Difficulty</label>
        <select id="test-difficulty" className="w-full border rounded-lg p-2.5 bg-white" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
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

      {/* Date & Time Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-start-time">Start time</label>
          <input id="test-start-time" type="datetime-local" className="w-full border rounded-lg p-2.5 text-sm" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-due-date">Due date</label>
          <input id="test-due-date" type="date" className="w-full border rounded-lg p-2.5 text-sm" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="test-duration">Duration (minutes)</label>
          <input id="test-duration" type="number" min="1" placeholder="60" className="w-full border rounded-lg p-2.5" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} />
        </div>
      </div>

      {/* Attempt Rules */}
      <div className="assessment-retake-settings p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={allowRetake} onChange={e => setAllowRetake(e.target.checked)} />
          <span className="text-sm font-medium text-slate-700">Allow Retakes</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Max attempts:</span>
          <input type="number" min={1} className="w-16 border rounded-lg p-1.5 text-center" 
            value={maxAttempts}
            disabled={!allowRetake}
            onChange={e => setMaxAttempts(e.target.value)}
          />
        </div>
      </div>
    </div>

    {/* Right Column: Subjects & Students (1 col) */}
    <div className="assessment-side-column space-y-6">
      
      {/* Subjects Card */}
      <div className="assessment-side-panel bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="assessment-panel-heading">
          <h2>Subject</h2>
          <p>Select one subject for this test.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <button
              key={subject._id}
              className={`text-sm subject-card ${selectedSubject === subject._id ? 'active' : ''}`}
              onClick={() => setSelectedSubject(subject._id)}
              type="button"
              aria-pressed={selectedSubject === subject._id}
            >
              {subject.subjectName}
            </button>
          ))}
        </div>
      </div>

      {/* Assign Students Card */}
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
          {visibleStudents.length ? visibleStudents.map((student) => (
            <button
              key={student._id}
              className={`student-item text-sm ${selectedStudents.includes(student._id) ? 'selected' : ''}`}
              onClick={() => toggleStudent(student._id)} 
              type="button"
              aria-pressed={selectedStudents.includes(student._id)}
            >
              {student.name}
            </button>
          )) : <p className="selection-empty">No students match your search.</p>}
        </div>
      </div>

      <button 
        onClick={submitHandler}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-xl shadow-sm transition"
      >
        Create Test
      </button>

    </div>
  </div>
    </div>
  )
}
