import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Gamepad2, LockKeyhole, ShieldCheck, Sparkles, Users } from "lucide-react";
import { api, type TeacherIdentity } from "./api";
import { Brand } from "./Student";
import { Badge, Button, Card, Input } from "./ui";

export function Landing() {
  return <div className="entry-page"><div className="entry-art" /><header className="entry-header"><Link to="/"><Brand /></Link><nav><Link to="/login">Teacher sign in</Link><Link className="entry-nav-button" to="/admin/login">Admin sign in <ArrowRight size={16} /></Link></nav></header><main className="entry-main"><div className="entry-intro"><Badge className="light-badge">A CLASSROOM FULL OF POSSIBILITY</Badge><h1>Learning feels better when <em>everyone plays.</em></h1><p>Bring your class together for live quizzes, little victories, and big discoveries.</p><div className="entry-highlights"><span><Sparkles size={17} /> Live classroom energy</span><span><ShieldCheck size={17} /> No student account needed</span></div></div><div className="entry-choices"><Card><div className="entry-choice-icon"><Gamepad2 size={25} /></div><Badge>FOR STUDENTS</Badge><h2>Joining a quiz?</h2><p>Just tell us your name, then enter the code your teacher gave you.</p><Link className="ui-button ui-button-primary" to="/join">Join as student <ArrowRight size={17} /></Link></Card><Card><div className="entry-choice-icon teacher"><BookOpenCheck size={25} /></div><Badge>FOR TEACHERS</Badge><h2>Lead the adventure.</h2><p>Sign in with the account your school admin created to host games.</p><Link className="ui-button ui-button-outline" to="/login">Teacher sign in <ArrowRight size={17} /></Link><span className="entry-signin">Need an account? Ask your school admin.</span></Card></div></main></div>;
}

export function StudentName() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => sessionStorage.getItem("ckadinti-student-name") ?? "");
  const code = new URLSearchParams(window.location.search).get("code") ?? "";
  function continueToCode(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    sessionStorage.setItem("ckadinti-student-name", name.trim());
    localStorage.removeItem("ckadinti-player");
    navigate(`/play${code ? `?code=${encodeURIComponent(code)}` : ""}`);
  }
  return <div className="student-name-page"><div className="entry-art" /><header className="entry-header"><Link to="/"><Brand /></Link><Link to="/login">Teacher login</Link></header><main className="student-name-main"><Badge className="light-badge">STEP 1 OF 2 · JOIN A QUIZ</Badge><h1>What should we call you?</h1><p>No account needed. Your teacher will see this name in the game.</p><Card className="student-name-card"><form onSubmit={continueToCode}><label htmlFor="student-name">Your name</label><Input id="student-name" autoComplete="given-name" autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={32} required placeholder="Type your name" /><Button type="submit" disabled={!name.trim()}>Continue to game code <ArrowRight size={18} /></Button></form></Card><span className="student-name-note">Next, enter the six-character code from your teacher.</span></main></div>;
}

export function TeacherAuth({ kind }: { kind: "teacher" | "admin" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api.loginTeacher(email.trim(), password, kind);
      localStorage.setItem("ckadinti-teacher", JSON.stringify(result));
      localStorage.removeItem("ckadinti-host");
      navigate(result.teacher.role === "admin" ? "/admin" : result.teacher.mustChangePassword ? "/change-password" : "/teacher", { replace: true });
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message === "invalid_credentials" ? "Email or password is incorrect." : message === "wrong_sign_in_portal" ? kind === "teacher" ? "This is an administrator account. Please use Admin sign in." : "This is a teacher account. Please use Teacher sign in." : message);
    } finally { setBusy(false); }
  }
  return <div className="auth-page"><div className="auth-art" /><header className="entry-header"><Link to="/"><Brand /></Link><Link to="/join">Join a quiz <ArrowRight size={16} /></Link></header><main className="auth-layout"><div className="auth-story"><Badge className="light-badge">{kind === "admin" ? "ADMIN WORKSPACE" : "TEACHER WORKSPACE"}</Badge><h1>{kind === "admin" ? "Keep your classroom team connected." : "Welcome back, teacher."}</h1><p>{kind === "admin" ? "Manage teacher access and see what's happening across your school." : "Create games, invite your class, and celebrate what they learn together."}</p><div className="auth-story-points"><span><Users size={18} /> {kind === "admin" ? "Manage teacher accounts" : "Bring your whole class together"}</span><span><LockKeyhole size={18} /> Secure account access</span></div></div><Card className="auth-card"><div className="entry-choice-icon teacher"><BookOpenCheck size={25} /></div><h2>{kind === "admin" ? "Admin sign in" : "Teacher sign in"}</h2><p>Enter the credentials for your account.</p><form onSubmit={e => void submit(e)}><label>Email address<Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@school.edu" /></label><label>Password<Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Your password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Please wait…" : "Sign in"}<ArrowRight size={17} /></Button></form><div className="auth-switch">{kind === "admin" ? <>Teacher account? <Link to="/login">Teacher sign in</Link></> : <>Need an account? Ask your school admin. <Link to="/admin/login">Admin sign in</Link></>}</div></Card></main></div>;
}

export function ChangePassword() {
  const navigate = useNavigate();
  const [auth] = useState<TeacherIdentity | null>(() => { try { return JSON.parse(localStorage.getItem("ckadinti-teacher") ?? "null") as TeacherIdentity | null; } catch { return null; } });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.teacher.role === "admin") return <Navigate to="/admin" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) { setError("The new passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const updated = await api.changeTeacherPassword(auth!.token, currentPassword, newPassword);
      localStorage.setItem("ckadinti-teacher", JSON.stringify(updated));
      navigate("/teacher", { replace: true });
    } catch (cause) { setError((cause as Error).message === "invalid_credentials" ? "The temporary password is incorrect." : (cause as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><div className="auth-art" /><header className="entry-header"><Link to="/"><Brand /></Link></header><main className="auth-layout"><div className="auth-story"><Badge className="light-badge">ONE LAST STEP</Badge><h1>Make this account yours.</h1><p>Replace the one-time password your admin gave you with a private password only you know.</p></div><Card className="auth-card"><div className="entry-choice-icon teacher"><LockKeyhole size={24} /></div><h2>Set your password</h2><p>Use at least ten characters.</p><form onSubmit={e => void submit(e)}><label>Temporary password<Input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></label><label>New password<Input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={10} required /></label><label>Confirm new password<Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={10} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password & open dashboard"}<ArrowRight size={17} /></Button></form></Card></main></div>;
}
