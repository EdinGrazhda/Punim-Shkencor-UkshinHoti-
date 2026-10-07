import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Gamepad2, LayoutDashboard, LogOut, RefreshCw, Trophy } from "lucide-react";
import { api, type PlayerIdentity, type StudentAccountIdentity, type StudentLeaderboard } from "./api";
import { Brand } from "./Student";
import { Button, Card, Input } from "./ui";
import "./StudentPanel.css";

function savedStudent(): StudentAccountIdentity | null {
  try {
    const value = JSON.parse(localStorage.getItem("ckadinti-student-account") ?? "null") as StudentAccountIdentity | null;
    return value?.token && value.student?.id ? value : null;
  } catch { return null; }
}

export function StudentPanel() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [account, setAccount] = useState<StudentAccountIdentity | null>(savedStudent);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState(() => savedStudent()?.student.name ?? sessionStorage.getItem("ckadinti-student-name") ?? "");
  const [code, setCode] = useState(() => (new URLSearchParams(window.location.search).get("code") ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6));
  const [leaderboard, setLeaderboard] = useState<StudentLeaderboard | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const page = params.get("view") === "leaderboard" ? "leaderboard" : "dashboard";

  useEffect(() => {
    const current = savedStudent();
    if (!current) { setChecking(false); return; }
    let active = true;
    api.studentMe(current.token).then(({ student }) => {
      if (!active) return;
      const updated = { ...current, student };
      localStorage.setItem("ckadinti-student-account", JSON.stringify(updated));
      setAccount(updated);
      setName(student.name);
      setChecking(false);
    }).catch(() => {
      if (!active) return;
      localStorage.removeItem("ckadinti-student-account");
      setAccount(null);
      setChecking(false);
    });
    return () => { active = false; };
  }, [navigate]);

  async function refreshLeaderboard() {
    try { setLeaderboard(await api.studentLeaderboard()); setBoardError(false); }
    catch { setBoardError(true); }
    finally { setLoadingBoard(false); }
  }
  useEffect(() => {
    if (checking) return;
    void refreshLeaderboard();
    const timer = window.setInterval(() => { void refreshLeaderboard(); }, 10000);
    return () => window.clearInterval(timer);
  }, [account?.student.id, checking]);

  async function joinGame(event: FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const displayName = account?.student.name ?? name.trim();
      if (!displayName) throw new Error("Enter the name your teacher will see.");
      const session = await api.state(code.trim().toUpperCase());
      if (session.phase !== "lobby" || session.lobbyLocked) throw new Error("This game is not accepting players right now.");
      const joined = await api.join(session.code, displayName, "Comet", account?.token);
      const player: PlayerIdentity = { code: session.code, id: joined.player.id, token: joined.playerToken, name: displayName, emblem: "Comet" };
      sessionStorage.setItem("ckadinti-student-name", displayName);
      sessionStorage.removeItem("ckadinti-join-as-guest");
      localStorage.setItem("ckadinti-player", JSON.stringify(player));
      navigate(`/play?code=${encodeURIComponent(session.code)}`);
    } catch (cause) {
      const message = (cause as Error).message;
      if (message === "Session access expired. Please join again.") {
        localStorage.removeItem("ckadinti-student-account");
        setAccount(null);
        setError("Your sign in expired. Enter your name to join as a guest, or sign in again.");
      } else setError(message);
    } finally { setBusy(false); }
  }

  async function logout() {
    if (account) await api.logoutStudent(account.token).catch(() => undefined);
    localStorage.removeItem("ckadinti-student-account");
    localStorage.removeItem("ckadinti-player");
    setAccount(null);
    setName("");
  }

  if (checking) return <div className="auth-loading">Opening your student panel…</div>;
  if (!account) return <Navigate to="/join" replace />;
  return <div className="student-workspace">
    <aside className="student-sidebar">
      <Link className="student-sidebar-brand" to="/"><Brand /></Link>
      <span className="student-sidebar-label">STUDENT SPACE</span>
      <nav aria-label="Student navigation">
        <button type="button" className={`student-sidebar-item ${page === "dashboard" ? "active" : ""}`} onClick={() => setParams({})}><LayoutDashboard size={18} /> Dashboard</button>
        <button type="button" className={`student-sidebar-item ${page === "leaderboard" ? "active" : ""}`} onClick={() => setParams({ view: "leaderboard" })}><Trophy size={18} /> Leaderboard</button>
      </nav>
      <div className="student-sidebar-bottom"><span className="student-sidebar-avatar">{(account?.student.name ?? name).slice(0, 1).toUpperCase() || "?"}</span><div><strong>{account?.student.name ?? "Guest player"}</strong><small>{account ? "Student account" : "Join without signing in"}</small></div></div>
      {account ? <button type="button" className="student-sidebar-item student-signout" onClick={() => void logout()}><LogOut size={17} /> Sign out</button> : <Link className="student-sidebar-item student-signout" to="/student/account">Sign in / register</Link>}
    </aside>
    <div className="student-workspace-content">
      <header className="student-dashboard-header"><span>{page === "dashboard" ? "Dashboard" : "Leaderboard"}</span><strong>{account ? `Hi, ${account.student.name.split(" ")[0]}!` : "Playing as guest"}</strong></header>
      <main className="student-dashboard-main">
        {page === "dashboard" ? <>
          <div className="student-dashboard-heading"><div><span className="student-dashboard-kicker">YOUR STUDENT PANEL</span><h1>Ready for your next game?</h1><p>Enter the code from your teacher to join the class game.</p></div></div>
          <div className="student-dashboard-grid">
            <Card className="student-join-card"><div className="student-panel-card-icon"><Gamepad2 size={23} /></div><span className="student-dashboard-kicker">JOIN A CLASS GAME</span><h2>Enter the game code</h2><p>Your teacher will share a six-character code when the game is ready.</p><form onSubmit={event => void joinGame(event)}>{!account && <><label htmlFor="student-panel-name">Your name</label><Input id="student-panel-name" autoComplete="given-name" maxLength={32} required value={name} onChange={event => setName(event.target.value)} placeholder="Name shown in the game" /></>}<label htmlFor="student-panel-code">Game code</label><Input id="student-panel-code" autoComplete="off" autoCapitalize="characters" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} placeholder="e.g. K7H3M2" /><Button type="submit" disabled={busy || code.length !== 6 || (!account && !name.trim())}>{busy ? "Joining…" : "Join game"}<ArrowRight size={17} /></Button>{error && <p className="student-panel-error" role="alert">{error}</p>}</form></Card>
            <Card className="student-dashboard-preview"><div className="student-panel-card-icon"><Trophy size={23} /></div><span className="student-dashboard-kicker">CLASS LEADERBOARD</span><h2>See how everyone is doing</h2><p>Explore scores from students across the games hosted here.</p><strong>{leaderboard?.leaderboard.length ?? 0} students</strong><button type="button" className="ui-button ui-button-outline" onClick={() => setParams({ view: "leaderboard" })}>View leaderboard <ArrowRight size={17} /></button></Card>
          </div>
        </> : <>
          <div className="student-dashboard-heading"><div><span className="student-dashboard-kicker">ALL STUDENTS</span><h1>Student leaderboard</h1><p>Scores from class games. Student accounts keep points together across games.</p></div></div>
          <Card className="student-global-board"><div className="student-board-heading"><div><h2>Rankings</h2><p>{leaderboard?.leaderboard.length ?? 0} students</p></div><button type="button" aria-label="Refresh leaderboard" title="Refresh leaderboard" onClick={() => void refreshLeaderboard()}><RefreshCw size={17} /></button></div>{loadingBoard ? <p className="student-board-empty">Loading student scores…</p> : boardError ? <div className="student-board-empty"><strong>Could not load the leaderboard</strong><button type="button" className="text-button" onClick={() => void refreshLeaderboard()}>Try again</button></div> : leaderboard?.leaderboard.length ? <div className="student-board-list">{leaderboard.leaderboard.map((student, index) => <div className={`student-board-row ${account && student.id === `account:${account.student.id}` ? "is-current-student" : ""}`} key={student.id}><span className="student-board-rank">{index + 1}</span><span className="student-board-avatar">{student.displayName.slice(0, 1).toUpperCase()}</span><strong>{student.displayName}{account && student.id === `account:${account.student.id}` ? " (you)" : ""}</strong><span className="student-board-games">{student.gamesPlayed} {student.gamesPlayed === 1 ? "game" : "games"}</span><b>{student.score.toLocaleString()} pts</b></div>)}</div> : <div className="student-board-empty"><Trophy size={28} /><strong>No students yet</strong></div>}</Card>
        </>}
      </main>
    </div>
  </div>;
}
