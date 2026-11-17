import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import API from "../services/api";

export default function Dashboard() {
  const [stats, setStats] = useState({
    assigned: 0,
    completed: 0,
    pending: 0,
    passed: 0,
    failed: 0,
    averageScore: 0,
    totalTimeInSeconds: 0,
  });

  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const res = await API.get("/student/dashboard");

        setStats(res.data.stats || {});
        setRecentSubmissions(res.data.recentSubmissions || []);

      } catch (err) {
        console.error("Dashboard error:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const formatTime = (seconds = 0) => {
    if (seconds === 0) return '-'
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600)
      const mins = Math.floor((seconds % 3600) / 60)
      const secs = Math.floor((seconds % 3600) % 60)
      return `${hours}h ${mins}m ${secs}s`
    }
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}m ${secs}s`
    }
    return `${seconds}s`
  };

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main student-dashboard">

        <div className="student-dashboard-heading">
          <div>
            <p className="student-dashboard-eyebrow">Your learning overview</p>
            <h1>Student dashboard</h1>
            <p>Track your assessments and see how your learning is progressing.</p>
          </div>
        </div>

        {loadError && (
          <div className="student-dashboard-notice" role="status">
            Some dashboard information couldn’t be refreshed. Showing the information currently available.
          </div>
        )}

        {/* Dashboard Statistics */}
        <div className="student-stat-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6" aria-busy={loading}>

          {/* Assigned Tests */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Assigned Tests
                </p>
                {loading ? (
                  <div className="mt-2 h-8 w-12 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {stats.assigned}
                  </h3>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-xl">
                📚
              </div>
            </div>
            <p className="mt-3 text-xs student-stat-help">
              Total assigned
            </p>
          </div>

          {/* Pending */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Pending
                </p>
                {loading ? (
                  <div className="mt-2 h-8 w-12 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {stats.pending}
                  </h3>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-50 text-yellow-600 text-xl">
                ⏳
              </div>
            </div>
            <p className="mt-3 text-xs student-stat-help">
              Waiting to complete
            </p>
          </div>

          {/* Completed */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Completed
                </p>
                {loading ? (
                  <div className="mt-2 h-8 w-12 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {stats.completed}
                  </h3>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600 text-xl">
                ✓
              </div>
            </div>
            <p className="mt-3 text-xs student-stat-help">
              Tests completed
            </p>
          </div>

          {/* Passed */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Passed
                </p>
                {loading ? (
                  <div className="mt-2 h-8 w-12 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {stats.passed}
                  </h3>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-xl">
                🏆
              </div>
            </div>
            <p className="mt-3 text-xs student-stat-help">
              Successful tests
            </p>
          </div>

          {/* Failed */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Failed
                </p>
                {loading ? (
                  <div className="mt-2 h-8 w-12 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {stats.failed}
                  </h3>
                )}
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 text-xl">
                !
              </div>
            </div>
            <p className="mt-3 text-xs student-stat-help">
              Needs improvement
            </p>
          </div>

          {/* Average Score */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Average Score
                </p>
                {loading ? (
                  <div className="mt-2 h-8 w-16 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {stats.averageScore}%
                  </h3>
                )}
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 text-xl">
                ⭐
              </div>
            </div>
            <p className="mt-3 text-xs student-stat-help">
              Overall performance
            </p>
          </div>

          {/* Total Time */}
          <div className="student-stat-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium student-stat-label">
                  Total Time
                </p>

                {loading ? (
                  <div className="mt-2 h-8 w-20 student-stat-skeleton rounded animate-pulse" />
                ) : (
                  <h3 className="mt-2 text-3xl font-bold student-stat-value">
                    {formatTime(stats.totalTimeInSeconds)}
                  </h3>
                )}
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600 text-xl">
                ⏱
              </div>
            </div>

            <p className="mt-3 text-xs student-stat-help">
              Time spent testing
            </p>
          </div>
        </div>

        {/* Recent Attempts */}
        <div className="card student-recent-card mt-3">

          <div className="header student-recent-heading">
            <div>
              <h2>Recent attempts</h2>
              <p>A quick look at your latest assessment results.</p>
            </div>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : recentSubmissions.length === 0 ? (
            <div className="student-dashboard-empty">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>No attempts yet</strong>
                <p>Your completed assessments will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">

                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Time</th>
                    <th>Result</th>
                  </tr>
                </thead>

                <tbody>
                  {recentSubmissions.map(sub => (
                    <tr key={sub._id}>

                      <td>{sub.title}</td>

                      <td>
                        {sub.score} / {sub.totalMarks}
                      </td>

                      <td>
                        {sub.percentage}%
                      </td>

                      <td>
                        {sub.correct}
                      </td>

                      <td>
                        {sub.wrong}
                      </td>

                      <td>
                        {formatTime(sub.timeTakenInSeconds)}
                      </td>

                      <td>
                        {sub.passed ? (
                          <span className="badge success">
                            Passed
                          </span>
                        ) : (
                          <span className="badge danger">
                            Failed
                          </span>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          )}

        </div>

      </main>
    </div>
  );
}