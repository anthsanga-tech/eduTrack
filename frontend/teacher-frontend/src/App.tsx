import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Tests from "./pages/Tests.jsx";
import CreateTest from "./pages/CreateTest.jsx";
import EditTest from "./pages/EditTest.jsx";
import Questions from "./pages/Questions.jsx";
import CreateQuestion from "./pages/CreateQuestion.jsx";
import EditQuestion from "./pages/EditQuestion.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import MainLayout from "./layouts/MainLayout.jsx";
import ManageQuestions from "./pages/ManageQuestions.jsx";
import PasswordReset from "./pages/PasswordReset";
import Reports from "./pages/Reports.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<PasswordReset role="teacher" />} />
        <Route path="/reset-password" element={<PasswordReset role="teacher" />} />

        {/* Protected + Layout */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/tests" element={<Tests />} />
          <Route path="/tests/create" element={<CreateTest />} />
          <Route path="/tests/edit/:testId" element={<EditTest />} />
          <Route path="/tests/manage/:testId" element={<ManageQuestions />}/>
          <Route path="/tests/view/:testId" element={<ManageQuestions readOnly />}/>
          <Route path="/questions" element={<Questions />} />
          <Route path="/questions/create" element={<CreateQuestion />} />
          <Route path="/teacher/questions/:questionId/edit" element={<EditQuestion />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
