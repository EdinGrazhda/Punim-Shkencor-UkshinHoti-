import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Student } from "./Student";
import { Projector, Teacher } from "./Teacher";
import { ChangePassword, Landing, StudentAccount, StudentName, TeacherAuth } from "./Entry";
import { AdminPanel } from "./Admin";
import { StudentPanel } from "./StudentPanel";
import { api, clearTeacherIdentity, readTeacherIdentity, type TeacherIdentity } from "./api";
import "./styles.css";

function AccountGate({ role }: { role: "teacher" | "admin" }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [auth] = useState<TeacherIdentity | null>(() => readTeacherIdentity(role));
  useEffect(() => {
    if (!auth?.token) { navigate("/login", { replace: true }); return; }
    let active = true;
    api.teacherMe(auth.token).then(async ({ teacher }) => {
      if (!active) return;
      if (teacher.role !== role) { navigate(teacher.role === "admin" ? "/admin" : "/teacher", { replace: true }); return; }
      if (role === "teacher") {
        if (teacher.mustChangePassword) { navigate("/change-password", { replace: true }); return; }
        const session = await api.teacherSession(auth.token);
        if (!active) return;
        if (session.session) localStorage.setItem("ckadinti-host", JSON.stringify({ code: session.session.code, token: session.session.token }));
        else localStorage.removeItem("ckadinti-host");
      }
      setReady(true);
    }).catch(() => { if (active) { localStorage.removeItem("ckadinti-teacher"); localStorage.removeItem("ckadinti-host"); navigate(role === "admin" ? "/admin/login" : "/login", { replace: true }); } });
    return () => { active = false; };
  }, [auth?.token, navigate, role]);
  async function logout() { if (auth?.token) { await api.logoutTeacher(auth.token).catch(() => undefined); clearTeacherIdentity(auth); } localStorage.removeItem("ckadinti-host"); navigate("/", { replace: true }); }
  return ready && auth ? <>{role === "teacher" ? <><Teacher /><button className="teacher-logout" onClick={() => void logout()}>Log out</button></> : <AdminPanel auth={auth} onLogout={() => void logout()} />}</> : <div className="auth-loading">Opening your workspace…</div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<TeacherAuth kind="teacher" />} /><Route path="/admin/login" element={<TeacherAuth kind="admin" />} /><Route path="/change-password" element={<ChangePassword />} /><Route path="/register" element={<Navigate to="/login" replace />} /><Route path="/students" element={<StudentPanel />} /><Route path="/student/account" element={<StudentAccount />} /><Route path="/join" element={<StudentName />} /><Route path="/play" element={<Student />} /><Route path="/teacher" element={<AccountGate role="teacher" />} /><Route path="/admin" element={<AccountGate role="admin" />} /><Route path="/projector" element={<Projector />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter></React.StrictMode>);
