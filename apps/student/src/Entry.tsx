import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Gamepad2, LockKeyhole, ShieldCheck, Sparkles, Users } from "lucide-react";
import { api, readTeacherIdentity, storeTeacherIdentity, type StudentAccountIdentity, type TeacherIdentity } from "./api";
import { Brand } from "./Student";
import { Badge, Button, Card, Input } from "./ui";

export function Landing() {
  return <div className="entry-page"><div className="entry-art" /><header className="entry-header"><Link to="/"><Brand /></Link><nav><Link to="/login">Teacher sign in</Link><Link className="entry-nav-button" to="/admin/login">Admin sign in <ArrowRight size={16} /></Link></nav></header><main className="entry-main"><div className="entry-intro"><Badge className="light-badge">A CLASSROOM FULL OF POSSIBILITY</Badge><h1>Learning feels better when <em>everyone plays.</em></h1><p>Bring your class together for live quizzes, little victories, and big discoveries.</p><div className="entry-highlights"><span><Sparkles size={17} /> Student accounts and quick joining</span><span><ShieldCheck size={17} /> See the school leaderboard</span></div></div><div className="entry-choices"><Card><div className="entry-choice-icon"><Gamepad2 size={25} /></div><Badge>FOR STUDENTS</Badge><h2>Student space</h2><p>Join a game with your name and your teacher’s code. Signing in is optional.</p><Link className="ui-button ui-button-primary" to="/students">Join with your name <ArrowRight size={17} /></Link><Link className="entry-signin" to="/student/account">Create account or sign in</Link></Card><Card><div className="entry-choice-icon teacher"><BookOpenCheck size={25} /></div><Badge>FOR TEACHERS</Badge><h2>Lead the adventure.</h2><p>Sign in with the account your school admin created to host games.</p><Link className="ui-button ui-button-outline" to="/login">Teacher sign in <ArrowRight size={17} /></Link><span className="entry-signin">Need an account? Ask your school admin.</span></Card></div></main></div>;
}

export function StudentName() {
  const navigate = useNavigate();
  const [account] = useState<StudentAccountIdentity | null>(() => { try { return JSON.parse(localStorage.getItem("ckadinti-student-account") ?? "null") as StudentAccountIdentity | null; } catch { return null; } });
  const [name, setName] = useState(() => sessionStorage.getItem("ckadinti-student-name") ?? account?.student.name ?? "");
  const code = new URLSearchParams(window.location.search).get("code") ?? "";
  function continueToCode(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    sessionStorage.setItem("ckadinti-student-name", name.trim());
    localStorage.removeItem("ckadinti-player");
    navigate(`/play${code ? `?code=${encodeURIComponent(code)}` : ""}`);
  }
  return <div className="student-name-page"><div className="entry-art" /><header className="entry-header"><Link to="/"><Brand /></Link><Link to="/students">Student panel</Link></header><main className="student-name-main"><Badge className="light-badge">STEP 1 OF 2 · JOIN A QUIZ</Badge><h1>What should we call you?</h1><p>No account needed. Your teacher will see this name in the game.</p><Card className="student-name-card"><form onSubmit={continueToCode}><label htmlFor="student-name">Your name</label><Input id="student-name" autoComplete="given-name" autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={32} required placeholder="Type your name" /><Button type="submit" disabled={!name.trim()}>Continue to game code <ArrowRight size={18} /></Button></form><div className="student-account-prompt">Want your profile remembered? <Link to={`/student/account${code ? `?code=${encodeURIComponent(code)}` : ""}`}>{account ? "Manage student account" : "Create or sign in"}</Link></div></Card><span className="student-name-note">Next, enter the six-character code from your teacher.</span></main></div>;
}

export function StudentAccount() {
  const navigate = useNavigate();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [savedAccount, setSavedAccount] = useState<StudentAccountIdentity | null>(() => { try { return JSON.parse(localStorage.getItem("ckadinti-student-account") ?? "null") as StudentAccountIdentity | null; } catch { return null; } });
  const [mode, setMode] = useState<"login" | "register">(() => savedAccount ? "login" : "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => savedAccount?.student.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "register" && password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const account = mode === "register" ? await api.registerStudent(name.trim(), email.trim(), password) : await api.loginStudent(email.trim(), password);
      localStorage.setItem("ckadinti-student-account", JSON.stringify(account));
      setSavedAccount(account);
      sessionStorage.setItem("ckadinti-student-name", account.student.name);
      navigate(`/students${params.get("code") ? `?code=${encodeURIComponent(params.get("code")!)}` : ""}`, { replace: true });
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message === "email_taken" ? "An account already uses this email. Sign in instead." : message === "invalid_credentials" ? "Email or password is incorrect." : message);
    } finally { setBusy(false); }
  }
  async function forgetSavedAccount() { if (!savedAccount) return; await api.logoutStudent(savedAccount.token).catch(() => undefined); localStorage.removeItem("ckadinti-student-account"); setSavedAccount(null); setMode("register"); setEmail(""); }
  return <div className="auth-page"><div className="auth-art" /><header className="entry-header"><Link to="/"><Brand /></Link><Link to="/join">Join with name only <ArrowRight size={16} /></Link></header><main className="auth-layout"><div className="auth-story"><Badge className="light-badge">STUDENT PROFILE</Badge><h1>{mode === "register" ? "Keep your name ready for the next game." : "Welcome back, player."}</h1><p>Create an account or sign in to open your student panel, join a game, and view the leaderboard.</p><div className="auth-story-points"><span><Users size={18} /> Join games with your teacher’s code</span><span><LockKeyhole size={18} /> Password protected profile</span></div></div><Card className="auth-card"><div className="entry-choice-icon"><Gamepad2 size={25} /></div><h2>{mode === "register" ? "Create student account" : "Student sign in"}</h2><p>{mode === "register" ? "Create your profile to open the student panel." : "Sign in to open your student panel."}</p>{savedAccount && <p className="student-saved-profile">Saved on this device: <strong>{savedAccount.student.name}</strong> <Link to="/students">Open panel</Link> <button type="button" className="text-button" onClick={() => void forgetSavedAccount()}>Forget</button></p>}<form onSubmit={event => void submit(event)}>{mode === "register" && <label>Your name<Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} required placeholder="Your name" /></label>}<label>Email address<Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" /></label><label>Password<Input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={mode === "register" ? 10 : undefined} required placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>{mode === "register" && <label>Confirm password<Input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={10} required placeholder="Type your password again" /></label>}{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}<ArrowRight size={17} /></Button></form><div className="auth-switch">{mode === "register" ? <>Already registered? <button type="button" className="text-button" onClick={() => { setMode("login"); setError(""); }}>Sign in</button></> : <>New here? <button type="button" className="text-button" onClick={() => { setMode("register"); setError(""); }}>Create an account</button></>}</div></Card></main></div>;
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
      storeTeacherIdentity(result);
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
  const [auth] = useState<TeacherIdentity | null>(() => readTeacherIdentity("teacher"));
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
      storeTeacherIdentity(updated);
      navigate("/teacher", { replace: true });
    } catch (cause) { setError((cause as Error).message === "invalid_credentials" ? "The temporary password is incorrect." : (cause as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><div className="auth-art" /><header className="entry-header"><Link to="/"><Brand /></Link></header><main className="auth-layout"><div className="auth-story"><Badge className="light-badge">ONE LAST STEP</Badge><h1>Make this account yours.</h1><p>Replace the one-time password your admin gave you with a private password only you know.</p></div><Card className="auth-card"><div className="entry-choice-icon teacher"><LockKeyhole size={24} /></div><h2>Set your password</h2><p>Use at least ten characters.</p><form onSubmit={e => void submit(e)}><label>Temporary password<Input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></label><label>New password<Input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={10} required /></label><label>Confirm new password<Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={10} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password & open dashboard"}<ArrowRight size={17} /></Button></form></Card></main></div>;
}
