import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth.jsx";
import Layout from "./components/Layout.jsx";
import { Loader } from "./components/ui.jsx";

import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Home from "./pages/Home.jsx";
import Tasks from "./pages/Tasks.jsx";
import TaskDetail from "./pages/TaskDetail.jsx";
import Camera from "./pages/Camera.jsx";
import Result from "./pages/Result.jsx";
import Profile from "./pages/Profile.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import History from "./pages/History.jsx";
import Achievements from "./pages/Achievements.jsx";
import Notifications from "./pages/Notifications.jsx";
import Settings from "./pages/Settings.jsx";
import Admin from "./pages/Admin.jsx";

function Private({ children, bare = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader text="Проверяем сессию" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return bare ? children : <Layout>{children}</Layout>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user && !loading ? <Navigate to="/" replace /> : <Register />} />

      <Route path="/" element={<Private><Home /></Private>} />
      <Route path="/tasks" element={<Private><Tasks /></Private>} />
      <Route path="/tasks/:id" element={<Private><TaskDetail /></Private>} />
      <Route path="/camera/:assignmentId" element={<Private bare><Camera /></Private>} />
      <Route path="/result/:submissionId" element={<Private><Result /></Private>} />
      <Route path="/profile" element={<Private><Profile /></Private>} />
      <Route path="/leaderboard" element={<Private><Leaderboard /></Private>} />
      <Route path="/history" element={<Private><History /></Private>} />
      <Route path="/achievements" element={<Private><Achievements /></Private>} />
      <Route path="/notifications" element={<Private><Notifications /></Private>} />
      <Route path="/settings" element={<Private><Settings /></Private>} />
      <Route path="/admin" element={<Private><Admin /></Private>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
