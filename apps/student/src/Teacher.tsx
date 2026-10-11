import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Expand,
  Flame,
  Gamepad2,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  MinusCircle,
  Pause,
  Play,
  Plus,
  Radio,
  Settings2,
  Shield,
  Square,
  Star,
  Trophy,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type {
  GameSnapshot,
  HostCommand,
  Player,
  PublicSessionState,
  TeamAssignmentMode,
} from "@ckadinti/contracts";
import {
  api,
  demoQuiz,
  readTeacherIdentity,
  type HostIdentity,
  type HostResults,
  type TeacherSessionSummary,
  watchSession,
} from "./api";
import { TeacherQuizStudio } from "./TeacherQuizStudio";
import "./teacher-history.css";
import "./teacher-sidebar.css";
import { Brand, Emblem } from "./Student";
import { Badge, Button, Card, ConfirmDialog, Progress, Switch } from "./ui";
import { formatTime } from "./utils";

type Tab =
  "dashboard" | "create" | "live" | "results" | "analytics" | "settings";
const nav: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: "dashboard", label: "Dashboard", Icon: Home },
  { id: "create", label: "Create Game", Icon: Plus },
  { id: "live", label: "Live Game", Icon: Radio },
  { id: "results", label: "Results", Icon: Trophy },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "settings", label: "Settings", Icon: Settings2 },
];

function LobbyPlayerAssignment({
  player,
  teamCount,
  teamAssignmentMode,
  busy,
  onSaveName,
  onAssignTeam,
}: {
  player: Player;
  teamCount: number;
  teamAssignmentMode: TeamAssignmentMode;
  busy: boolean;
  onSaveName: (displayName: string) => void;
  onAssignTeam: (teamIndex: number) => void;
}) {
  const [displayName, setDisplayName] = useState(player.displayName);
  useEffect(() => setDisplayName(player.displayName), [player.displayName]);
  const normalizedName = displayName.trim().replace(/\s+/gu, " ");
  const currentTeam = Number(player.teamId?.slice("team-".length)) || 0;

  return (
    <div className="player-assignment-controls">
      <label className="player-assignment-field">
        <span>Student name</span>
        <input
          aria-label={`Name for ${player.displayName}`}
          maxLength={32}
          value={displayName}
          disabled={busy}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      <Button
        className="player-assignment-save"
        variant="outline"
        disabled={busy || !normalizedName || normalizedName === player.displayName}
        onClick={() => onSaveName(normalizedName)}
      >
        Save name
      </Button>
      {teamCount > 0 && (
        <label className="player-assignment-field">
          <span>Team</span>
          <select
            aria-label={`Team for ${player.displayName}`}
            value={currentTeam}
            disabled={busy || teamAssignmentMode === "random"}
            onChange={(event) => onAssignTeam(Number(event.target.value))}
          >
            {teamAssignmentMode === "manual" && <option value={0}>Unassigned</option>}
            {Array.from({ length: teamCount }, (_, index) => index + 1).map((teamIndex) => (
              <option key={teamIndex} value={teamIndex}>Team {teamIndex}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function Teacher({ onLogout }: { onLogout: () => void }) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    (params.get("tab") as Tab) || "dashboard",
  );
  const [host, setHost] = useState<HostIdentity | null>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("ckadinti-host") ?? "null",
      ) as HostIdentity | null;
    } catch {
      return null;
    }
  });
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [gameSnapshot, setGameSnapshot] = useState<GameSnapshot>(demoQuiz);
  const [leaderboard, setLeaderboard] = useState<HostResults | null>(null);
  const [sessionHistory, setSessionHistory] = useState<TeacherSessionSummary[]>(
    [],
  );
  const [selectedHistoryCode, setSelectedHistoryCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [questionSeconds, setQuestionSeconds] = useState(10);
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!host) {
      const teacher = readTeacherIdentity("teacher");
      if (!teacher?.token) return;
      let active = true;
      void api
        .teacherSession(teacher.token)
        .then(({ session }) => {
          if (!active || !session) return;
          const restoredHost = { code: session.code, token: session.token };
          localStorage.setItem("ckadinti-host", JSON.stringify(restoredHost));
          setHost(restoredHost);
          setState(session.state);
        })
        .catch((cause) => {
          if (active) setError((cause as Error).message);
        });
      return () => {
        active = false;
      };
    }
    let active = true;
    void (async () => {
      try {
        let restoredHost = host;
        let hosted;
        try {
          hosted = await api.host(restoredHost);
        } catch {
          const teacher = readTeacherIdentity("teacher");
          if (!teacher?.token)
            throw new Error("Sign in again to restore your classroom session.");
          const resumed = await api.teacherSession(teacher.token);
          if (!resumed.session)
            throw new Error(
              "No saved classroom session is available to restore.",
            );
          restoredHost = {
            code: resumed.session.code,
            token: resumed.session.token,
          };
          hosted = await api.host(restoredHost);
          localStorage.setItem("ckadinti-host", JSON.stringify(restoredHost));
          if (active) setHost(restoredHost);
        }
        if (!active) return;
        setState(hosted.state);
        setGameSnapshot(hosted.snapshot);
        setQuestionSeconds(
          (hosted.snapshot.questions[0]?.timeLimitMs ?? 10000) / 1000,
        );
      } catch (cause) {
        if (active)
          setError(
            (cause as Error).message ||
              "Could not restore the classroom session.",
          );
      }
    })();
    const socket = watchSession(host.code, setState);
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [host?.code]);
  useEffect(() => {
    if (tab !== "results") return;
    const teacher = readTeacherIdentity("teacher");
    if (!teacher?.token) {
      setSessionHistory([]);
      setLeaderboard(null);
      setSelectedHistoryCode("");
      return;
    }
    let active = true;
    void api
      .teacherSessions(teacher.token)
      .then(({ sessions }) => {
        if (!active) return;
        setSessionHistory(sessions);
        setSelectedHistoryCode((current) =>
          sessions.some(
            (session) => session.code === current && session.phase === "ended",
          )
            ? current
            : (sessions.find((session) => session.phase === "ended")?.code ??
              ""),
        );
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [tab, host?.code, state?.phase]);
  useEffect(() => {
    if (tab !== "results" || !selectedHistoryCode) {
      setLeaderboard(null);
      return;
    }
    const teacher = readTeacherIdentity("teacher");
    if (!teacher?.token) {
      setLeaderboard(null);
      return;
    }
    let active = true;
    void api
      .teacherSessionResults(teacher.token, selectedHistoryCode)
      .then((results) => {
        if (active) setLeaderboard(results);
      })
      .catch((cause) => {
        if (active) {
          setLeaderboard(null);
          setError((cause as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, [tab, selectedHistoryCode]);

  function navigateTab(next: Tab) {
    setTab(next);
    setParams({ tab: next });
    setMobileMenu(false);
  }
  async function createSession(snapshot: GameSnapshot) {
    setBusy(true);
    setError("");
    try {
      const teacher = readTeacherIdentity("teacher");
      if (!teacher?.token) throw new Error("Please sign in to create a game.");
      const timedSnapshot = {
        ...snapshot,
        questions: snapshot.questions.map((question) => ({
          ...question,
          timeLimitMs: questionSeconds * 1000,
        })),
      };
      const created = await api.create(timedSnapshot, teacher.token);
      const next = { code: created.code, token: created.hostToken };
      localStorage.setItem("ckadinti-host", JSON.stringify(next));
      setGameSnapshot(timedSnapshot);
      setHost(next);
      setState(created.state);
      navigateTab("live");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function command(next: HostCommand) {
    if (!host) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.command(host, next);
      setState(response.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const count = state?.players.length ?? 0;
  const revealWaitMs = state?.phase === "reveal" ? Math.max(0, (state.revealUntil ?? 0) - now) : 0;
  const joinLink = host
    ? `${window.location.origin}/join?code=${host.code}`
    : "";

  return (
    <div className="teacher-app">
      <aside className={`teacher-sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-head">
          <Brand />
          <button
            className="mobile-close"
            aria-label="Close menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-group">
          <span className="sidebar-label">WORKSPACE</span>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${tab === item.id ? "active" : ""}`}
              onClick={() => navigateTab(item.id)}
            >
              <item.Icon size={19} strokeWidth={2} />
              {item.label}
              {item.id === "live" && state?.phase !== "ended" && state && (
                <i className="sidebar-live-dot" />
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="teacher-avatar">T</div>
            <div>
              <strong>Teacher</strong>
              <small>
                <span className="status-dot online" /> Ready to host
              </small>
            </div>
          </div>
          <button
            type="button"
            className="teacher-sidebar-logout"
            onClick={onLogout}
          >
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <main className="teacher-main">
        <header className="teacher-topbar">
          <button
            className="menu-toggle"
            aria-label="Open menu"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumbs">
            CkaDinTi <ChevronRight size={14} />{" "}
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="topbar-right">
            <Badge className="online-badge">
              <span className="status-dot online" /> System ready
            </Badge>
            <div className="teacher-avatar small">T</div>
          </div>
        </header>
        {error && (
          <div className="teacher-error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {tab === "dashboard" && (
          <div className="dashboard-content">
            <div className="page-heading">
              <div>
                <span className="section-kicker">YOUR CLASSROOM</span>
                <h1>Welcome, Teacher!</h1>
                <p>Ready to make learning feel like an adventure?</p>
              </div>
              <Button onClick={() => navigateTab("create")}>
                <Plus size={18} /> Create Game
              </Button>
            </div>
            <div className="dashboard-grid">
              <Card className="create-feature">
                <div className="create-icon">
                  <Gamepad2 size={28} />
                </div>
                <div>
                  <Badge>START HERE</Badge>
                  <h2>Make learning an adventure.</h2>
                  <p>
                    Launch a ready-to-play classroom mission and invite your
                    students in seconds.
                  </p>
                  <Button onClick={() => navigateTab("create")}>
                    Create a New Game <ArrowRight size={18} />
                  </Button>
                </div>
                <div className="feature-art">
                  <img
                    src="/images/adventure-world.png"
                    alt="Floating island adventure world"
                  />
                </div>
              </Card>
              <Card className="quick-stats">
                <div className="section-title">
                  <h2>Quick stats</h2>
                  <span>Current session</span>
                </div>
                <div className="stats-grid">
                  <Stat
                    Icon={Gamepad2}
                    value={state ? "1" : "0"}
                    label="Games played"
                  />
                  <Stat Icon={Users} value={String(count)} label="Students" />
                  <Stat
                    Icon={Activity}
                    value={
                      state
                        ? `${Math.round((state.answeredCount / Math.max(1, count)) * 100)}%`
                        : "—"
                    }
                    label="Participation"
                  />
                  <Stat
                    Icon={Star}
                    value={state?.phase === "ended" ? "Complete" : "—"}
                    label="Game status"
                  />
                </div>
              </Card>
              <Card className="recent-card">
                <div className="section-title">
                  <h2>Recent sessions</h2>
                  <button
                    className="text-button"
                    onClick={() => navigateTab("results")}
                  >
                    View all <ArrowRight size={15} />
                  </button>
                </div>
                {state ? (
                  <div className="recent-row">
                    <span className="recent-icon">
                      <Shield size={18} />
                    </span>
                    <div>
                      <strong>{gameSnapshot.title}</strong>
                      <small>
                        {count} students · {gameSnapshot.questions.length}{" "}
                        questions
                      </small>
                    </div>
                    <Badge className="phase-badge">{state.phase}</Badge>
                  </div>
                ) : (
                  <div className="empty-recent">
                    <Gamepad2 size={26} />
                    <strong>No sessions yet</strong>
                    <span>
                      Create your first classroom mission to see it here.
                    </span>
                  </div>
                )}
              </Card>
              <Card className="join-card-teacher">
                <div className="section-title">
                  <h2>Join code for today</h2>
                  <Badge>
                    {state && state.phase !== "ended" ? "Live" : "Ready"}
                  </Badge>
                </div>
                {host && state?.phase !== "ended" ? (
                  <>
                    <div className="teacher-code">{host.code}</div>
                    <div className="join-share">
                      <div className="qr-box">
                        <QRCodeSVG
                          value={joinLink}
                          size={110}
                          bgColor="#ffffff"
                          fgColor="#00004e"
                        />
                      </div>
                      <div>
                        <p>Students can join at:</p>
                        <strong>{joinLink}</strong>
                        <Button
                          variant="outline"
                          onClick={() =>
                            navigator.clipboard.writeText(joinLink)
                          }
                        >
                          <Copy size={15} /> Copy Link
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-recent">
                    <LockKeyhole size={26} />
                    <span>Create a game to get a join code and QR link.</span>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "create" && (
          <TeacherQuizStudio
            onCreateSession={createSession}
            busy={busy}
            questionSeconds={questionSeconds}
            setQuestionSeconds={setQuestionSeconds}
          />
        )}

        {tab === "live" && (
          <div className="live-content">
            <div className="page-heading live-heading">
              <div>
                <span className="section-kicker">LIVE GAME CONTROL</span>
                <h1>{gameSnapshot.title}</h1>
                <p>Lead the mission. Students see only the public game view.</p>
              </div>
              <div className="live-heading-actions">
                {state && (
                  <Badge className="live-status">
                    <span className="status-dot online" />{" "}
                    {state.phase.toUpperCase()}
                  </Badge>
                )}
                {host && (
                  <Link
                    className="ui-button ui-button-outline"
                    to={`/projector?code=${host.code}`}
                    target="_blank"
                  >
                    <Expand size={16} /> Open Projector
                  </Link>
                )}
              </div>
            </div>
            {!host || !state ? (
              <Card className="empty-live">
                <Gamepad2 size={36} />
                <h2>No live session yet</h2>
                <p>Create a game to open the teacher controls.</p>
                <Button onClick={() => navigateTab("create")}>
                  Create Game <ArrowRight size={18} />
                </Button>
              </Card>
            ) : (
              <>
                <div className="live-info-strip">
                  <div>
                    <span>JOIN CODE</span>
                    <strong>{host.code}</strong>
                    <button
                      aria-label="Copy code"
                      onClick={() => navigator.clipboard.writeText(host.code)}
                    >
                      <ClipboardCopy size={16} />
                    </button>
                  </div>
                  <div>
                    <span>PLAYERS</span>
                    <strong>{count} / 24</strong>
                  </div>
                  <div>
                    <span>ANSWERS</span>
                    <strong>
                      {state.answeredCount} / {count}
                    </strong>
                  </div>
                  {state.sessionMode === "timed-repeat" && (
                    <div>
                      <span>GAME TIME LEFT</span>
                      <strong>
                        {formatTime(
                          state.sessionDeadlineAt
                            ? Math.max(0, state.sessionDeadlineAt - now)
                            : (state.sessionRemainingMs ?? 0),
                        )}
                      </strong>
                    </div>
                  )}
                  <div>
                    <span>ROUND</span>
                    <strong>
                      {state.phase === "lobby"
                        ? "Waiting"
                        : state.sessionMode === "timed-repeat"
                          ? `Question ${(state.questionIndex ?? 0) + 1}`
                          : `${(state.questionIndex ?? 0) + 1} / ${gameSnapshot.questions.length}`}
                    </strong>
                  </div>
                </div>
                <div className="live-grid">
                  <Card className="question-nav">
                    <h2>
                      {state.sessionMode === "timed-repeat"
                        ? "Shuffled question pool"
                        : "Questions"}
                    </h2>
                    {gameSnapshot.questions.map((q, i) => (
                      <div
                        className={`question-nav-row ${state.sessionMode !== "timed-repeat" && i === state.questionIndex && state.phase !== "lobby" ? "current" : ""}`}
                        key={q.id}
                      >
                        <span>{i + 1}</span>
                        <p>{q.prompt}</p>
                        {state.sessionMode !== "timed-repeat" &&
                          i < (state.questionIndex ?? 0) && (
                            <CheckCircle2 size={15} />
                          )}
                      </div>
                    ))}
                  </Card>
                  <Card className="question-preview">
                    <div className="section-title">
                      <div>
                        <Badge>
                          {state.sessionMode === "timed-repeat"
                            ? `QUESTION ${(state.questionIndex ?? 0) + 1} · REPEAT MODE`
                            : `QUESTION ${(state.questionIndex ?? 0) + 1} OF ${gameSnapshot.questions.length}`}
                        </Badge>
                      </div>
                      <Badge className="phase-badge">{state.phase}</Badge>
                    </div>
                    <img
                      src="/images/password-quest.png"
                      alt="Laptop with a glowing lock"
                    />
                    <h2>
                      {state.phase === "lobby"
                        ? "Ready when your class is."
                        : state.question?.prompt}
                    </h2>
                    <p>
                      {state.phase === "lobby"
                        ? "Share the join code, then start the game when everyone is here."
                        : `${state.answeredCount} of ${count} students answered`}
                    </p>
                    <Progress
                      value={
                        state.phase === "lobby"
                          ? 0
                          : (state.answeredCount / Math.max(1, count)) * 100
                      }
                    />
                    <div className="control-bar">
                      {state.phase === "lobby" && (
                        <Button
                          onClick={() => void command({ type: "start" })}
                          disabled={busy}
                        >
                          <Play size={16} /> Start game
                        </Button>
                      )}
                      {state.phase === "question" && (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void command({ type: "pause" })}
                          >
                            <Pause size={16} /> Pause
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => void command({ type: "reveal" })}
                          >
                            Reveal answer <ArrowRight size={16} />
                          </Button>
                        </>
                      )}
                      {state.phase === "paused" && (
                        <Button
                          disabled={busy}
                          onClick={() => void command({ type: "resume" })}
                        >
                          <Play size={16} /> Resume
                        </Button>
                      )}
                      {state.phase === "reveal" && (
                        <Button disabled={busy || revealWaitMs > 0} onClick={() => void command({ type: "next" })}>
                          {revealWaitMs > 0 ? `Answer reveal · ${Math.ceil(revealWaitMs / 1_000)}s` : "Next question"} <ArrowRight size={16} />
                        </Button>
                      )}
                      {state.phase !== "ended" && (
                        <ConfirmDialog
                          title="End this game?"
                          description="Students will see their final results. This cannot be undone."
                          confirm="End Game"
                          onConfirm={() => void command({ type: "end" })}
                          trigger={
                            <Button variant="danger" disabled={busy}>
                              <Square size={15} /> End Game
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </Card>
                  <div className="live-right">
                    <Card className="player-activity">
                      <div className="section-title">
                        <h2>Live players</h2>
                        <Badge>{count} / 24</Badge>
                      </div>
                      {state.players.length ? (
                        state.players.map((p, i) => (
                          <div className="activity-player-entry" key={p.id}>
                            <div className="activity-row">
                              <Emblem
                                name={
                                  ["Comet", "Prism", "Orbit", "Spark", "Shield"][
                                    i % 5
                                  ]!
                                }
                              />
                              <div>
                                <strong>{p.displayName}</strong>
                                <small>{p.connected ? "Connected" : "Offline · retrying"}</small>
                                {p.teamName && <Badge className="team-pill">{p.teamName}</Badge>}
                              </div>
                              <Badge className="answer-state">
                                {!p.connected
                                  ? "Offline"
                                  : state.phase === "lobby"
                                    ? "Ready"
                                    : state.phase === "question" || state.phase === "paused"
                                      ? p.answered ? "Answered" : "Waiting"
                                      : state.phase}
                              </Badge>
                              <ConfirmDialog
                                title={`Remove ${p.displayName}?`}
                                description="This student will be removed from the current game and cannot reconnect to this player session."
                                confirm="Remove student"
                                onConfirm={() => void command({ type: "kick", playerId: p.id })}
                                trigger={<button type="button" className="kick-button" title={`Remove ${p.displayName}`} aria-label={`Remove ${p.displayName}`} disabled={busy}><X size={15} /></button>}
                              />
                            </div>
                            {state.phase === "lobby" && (
                              <LobbyPlayerAssignment
                                player={p}
                                teamCount={state.teamCount ?? 0}
                                teamAssignmentMode={state.teamAssignmentMode ?? "random"}
                                busy={busy}
                                onSaveName={(displayName) => void command({ type: "rename-player", playerId: p.id, displayName })}
                                onAssignTeam={(teamIndex) => void command({ type: "assign-player-team", playerId: p.id, teamIndex })}
                              />
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="empty-list">
                          No players yet. Share the code to invite your class.
                        </p>
                      )}
                    </Card>
                    <Card className="settings-card">
                      <h2>Game settings</h2>
                      {state.phase === "lobby" && (
                        <>
                          <label className="classroom-setting">
                            Teams
                            <select value={state.teamCount ?? 0} disabled={busy} onChange={event => void command({ type: "set-team-count", teamCount: Number(event.target.value) as 0 | 2 | 3 | 4 | 5 | 6 })}>
                              <option value={0}>Individual play</option>
                              {[2, 3, 4, 5, 6].map(teamCount => <option key={teamCount} value={teamCount}>{teamCount} teams</option>)}
                            </select>
                            <small>Choose individual play or set the number of teams, then select how students are assigned.</small>
                          </label>
                          <label className="classroom-setting">
                            Team assignment
                            <select value={state.teamAssignmentMode ?? "random"} disabled={busy || !(state.teamCount ?? 0)} onChange={event => void command({ type: "set-team-assignment-mode", teamAssignmentMode: event.target.value as TeamAssignmentMode })}>
                              <option value="manual">Assign students manually</option>
                              <option value="random">Randomly assign balanced teams</option>
                            </select>
                            <small>{!state.teamCount ? "Enable team play first." : state.teamAssignmentMode === "manual" ? "Students are unassigned until you place each one using the Team selector below. New arrivals stay unassigned." : "Students are shuffled into balanced teams; new arrivals join a smallest team chosen at random."}</small>
                          </label>
                          <label className="classroom-setting">
                            Nickname policy
                            <select value={state.nicknameMode ?? "student-choice"} disabled={busy} onChange={event => void command({ type: "set-nickname-mode", nicknameMode: event.target.value as "student-choice" | "assigned" })}>
                              <option value="student-choice">Students choose nicknames</option>
                              <option value="assigned">Assign classroom aliases</option>
                            </select>
                            <small>Assigned aliases replace entered names. You can then edit each student’s name below before starting.</small>
                          </label>
                          <label className="question-timer-setting">
                            Seconds per question
                            <input
                              type="number"
                              min={1}
                              max={600}
                              value={questionSeconds}
                              onChange={(e) =>
                                setQuestionSeconds(
                                  Math.max(
                                    1,
                                    Math.min(600, Number(e.target.value) || 10),
                                  ),
                                )
                              }
                            />
                          </label>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void command({
                                type: "set-timer",
                                timeLimitMs: questionSeconds * 1000,
                              })
                            }
                          >
                            Apply timer
                          </Button>
                        </>
                      )}
                      <Switch
                        checked={!state.lobbyLocked && state.phase === "lobby"}
                        disabled={busy || state.phase !== "lobby"}
                        onCheckedChange={(value) =>
                          void command({ type: "lock-lobby", locked: !value })
                        }
                        label={state.phase !== "lobby" ? "Lobby closed" : state.lobbyLocked ? "Lobby locked" : "Allow students to join"}
                      />
                      <Switch
                        checked={showLeaderboard}
                        onCheckedChange={setShowLeaderboard}
                        label="Show leaderboard"
                      />
                      <Switch
                        checked={sound}
                        onCheckedChange={setSound}
                        label="Play sound effects"
                      />
                    </Card>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "results" && (
          <TeacherResults
            results={leaderboard}
            sessions={sessionHistory}
            selectedCode={selectedHistoryCode}
            onSelect={setSelectedHistoryCode}
            ended={sessionHistory.some(
              (session) =>
                session.code === selectedHistoryCode &&
                session.phase === "ended",
            )}
          />
        )}

        {tab === "analytics" && (
          <div className="simple-page">
            <div className="page-heading">
              <div>
                <span className="section-kicker">MISSION INSIGHTS</span>
                <h1>Analytics</h1>
                <p>Quick indicators from the current classroom session.</p>
              </div>
            </div>
            <div className="analytics-grid">
              <Card>
                <Users size={24} />
                <small>PARTICIPATION</small>
                <strong>{count} students</strong>
                <Progress value={(count / 24) * 100} />
              </Card>
              <Card>
                <Activity size={24} />
                <small>ANSWER COUNT</small>
                <strong>{state?.answeredCount ?? 0} responses</strong>
                <Progress
                  value={
                    ((state?.answeredCount ?? 0) / Math.max(1, count)) * 100
                  }
                />
              </Card>
              <Card>
                <Gamepad2 size={24} />
                <small>QUIZ PROGRESS</small>
                <strong>
                  {state ? (state.questionIndex ?? 0) + 1 : 0} /{" "}
                  {gameSnapshot.questions.length}
                </strong>
                <Progress
                  value={
                    (((state?.questionIndex ?? -1) + 1) /
                      gameSnapshot.questions.length) *
                    100
                  }
                />
              </Card>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="simple-page">
            <div className="page-heading">
              <div>
                <span className="section-kicker">PREFERENCES</span>
                <h1>Classroom settings</h1>
                <p>Adjust how your current game behaves.</p>
              </div>
            </div>
            <Card className="settings-page-card">
              <Switch
                checked={showLeaderboard}
                onCheckedChange={setShowLeaderboard}
                label="Show leaderboard to students"
              />
              <Switch
                checked={sound}
                onCheckedChange={setSound}
                label="Play sound effects"
              />
              {host && (
                <Switch
                  checked={!state?.lobbyLocked && state?.phase === "lobby"}
                  disabled={state?.phase !== "lobby"}
                  onCheckedChange={(value) =>
                    void command({ type: "lock-lobby", locked: !value })
                  }
                  label={state?.phase !== "lobby" ? "Lobby closed" : state?.lobbyLocked ? "Lobby locked" : "Allow students to join"}
                />
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({
  Icon,
  value,
  label,
}: {
  Icon: typeof Home;
  value: string;
  label: string;
}) {
  return (
    <div className="stat">
      <span>
        <Icon size={20} />
      </span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function TeacherResults({
  results,
  sessions,
  selectedCode,
  onSelect,
  ended,
}: {
  results: HostResults | null;
  sessions: TeacherSessionSummary[];
  selectedCode: string;
  onSelect: (code: string) => void;
  ended: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggle(playerId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }
  return (
    <div className="simple-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">CLASSROOM RESULTS</span>
          <h1>Mission results</h1>
          <p>
            {ended
              ? "Final scores from the completed game. Open a student to review their answers."
              : "Choose a completed session to review its saved results."}
          </p>
        </div>
        <label className="history-picker">
          Session
          <select
            value={selectedCode}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">Select a completed session</option>
            {sessions.map((session) => (
              <option
                key={session.code}
                value={session.code}
                disabled={session.phase !== "ended"}
              >
                {session.title} ·{" "}
                {new Date(session.createdAt).toLocaleDateString()} ·{" "}
                {session.phase === "ended" ? "Completed" : session.phase}
              </option>
            ))}
          </select>
        </label>
      </div>
      {results?.teams && results.teams.length > 0 && (
        <Card className="team-standings-card">
          <div className="section-title">
            <h2>Team standings</h2>
            <Badge>{results.teams.length} teams</Badge>
          </div>
          {results.teams.map((team, index) => (
            <div className="leader-row" key={team.id}>
              <span className="rank">{index + 1}</span>
              <strong>{team.name}</strong>
              <span>{team.players} {team.players === 1 ? "player" : "players"}</span>
              <b>{team.score.toLocaleString()} pts</b>
            </div>
          ))}
        </Card>
      )}
      <Card className="teacher-results">
        {results?.leaderboard.length ? (
          results.leaderboard.map((player, index) => {
            const isExpanded = expanded.has(player.id);
            const panelId = `student-answers-${player.id}`;
            const correctCount = player.answers.filter(
              (answer) => answer.correct,
            ).length;
            return (
              <section
                className={`student-result ${isExpanded ? "expanded" : ""}`}
                key={player.id}
              >
                <button
                  className="result-row result-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  onClick={() => toggle(player.id)}
                >
                  <span>{index + 1}</span>
                  <Emblem
                    name={["Comet", "Prism", "Orbit", "Spark"][index % 4]!}
                  />
                  <span className="result-student">
                    <strong>{player.displayName}</strong>
                    <small>
                      {correctCount} of {player.answers.length} correct
                    </small>
                  </span>
                  <b>{player.score.toLocaleString()} pts</b>
                  <ChevronDown
                    className="result-chevron"
                    size={19}
                    aria-hidden="true"
                  />
                </button>
                {isExpanded && (
                  <div className="student-answer-panel" id={panelId}>
                    {player.answers.map((answer) => (
                      <article
                        className={`student-answer ${answer.correct ? "correct" : answer.answered ? "incorrect" : "unanswered"}`}
                        key={answer.questionIndex}
                      >
                        <div className="answer-result-icon" aria-hidden="true">
                          {answer.correct ? (
                            <CheckCircle2 size={20} />
                          ) : answer.answered ? (
                            <XCircle size={20} />
                          ) : (
                            <MinusCircle size={20} />
                          )}
                        </div>
                        <div className="answer-copy">
                          <span>Question {answer.questionIndex + 1}</span>
                          <strong>{answer.prompt}</strong>
                          <p>
                            <b>Student answer:</b>{" "}
                            {answer.selectedAnswer ?? "No answer"}
                          </p>
                          {!answer.correct && (
                            <p className="correct-answer">
                              <b>Correct answer:</b> {answer.correctAnswer}
                            </p>
                          )}
                        </div>
                        <span className="answer-points">
                          {answer.score.toLocaleString()} pts
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className="empty-recent">
            <Trophy size={32} />
            <strong>No results yet</strong>
            <span>Finish a live game to see classroom rankings.</span>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Projector() {
  const [params] = useSearchParams();
  const code = params.get("code")?.toUpperCase() ?? "";
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!code) return;
    api
      .state(code)
      .then(setState)
      .catch(() => undefined);
    const socket = watchSession(code, setState);
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, [code]);
  const question = state?.question;
  const remaining = question
    ? Math.max(0, Math.ceil((question.deadlineAt - now) / 1000))
    : 0;
  const gameRemaining = state?.sessionDeadlineAt
    ? Math.max(0, state.sessionDeadlineAt - now)
    : (state?.sessionRemainingMs ?? 0);
  const joinUrl = `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
  return (
    <div className="projector-page">
      <div className="projector-bg" />
      <header>
        <Brand />
        <Badge>
          {state ? `${state.players.length} players` : "Connecting"}
        </Badge>
      </header>
      <main>
        {state?.phase === "lobby" ? (
          <>
            <Badge className="light-badge">JOIN THE MISSION</Badge>
            <h1>Get ready for an adventure.</h1>
            <p>Open the student page and enter the code.</p>
            <div className="projector-join">
              <div className="projector-code">{code}</div>
              {code && (
                <div
                  className="projector-qr"
                  aria-label="QR code to join this mission"
                >
                  <QRCodeSVG
                    value={joinUrl}
                    size={164}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#00004e"
                  />
                </div>
              )}
              <p>Scan to join this mission</p>
            </div>
          </>
        ) : state?.phase === "ended" ? (
          <>
            <Badge className="light-badge">MISSION COMPLETE</Badge>
            <h1>Well played, class!</h1>
            <p>Every question was a step forward.</p>
          </>
        ) : (
          <>
            <Badge className="light-badge">
              {state?.sessionMode === "timed-repeat"
                ? `QUESTION ${(state?.questionIndex ?? 0) + 1} · REPEAT MODE`
                : `QUESTION ${(state?.questionIndex ?? 0) + 1} OF ${state?.questionCount ?? demoQuiz.questions.length}`}
            </Badge>
            <h1>{question?.prompt ?? "Waiting for the next question"}</h1>
            {state?.phase === "reveal" ? (
              <div className="projector-answer">
                <CheckCircle2 size={28} />{" "}
                {question?.options[state.reveal?.correctOption ?? 0]}
              </div>
            ) : (
              <div className="projector-timer">
                {state?.phase === "paused"
                  ? "Paused"
                  : formatTime(remaining * 1000)}
              </div>
            )}
            {state?.sessionMode === "timed-repeat" && (
              <p>Time remaining: {formatTime(gameRemaining)}</p>
            )}
            <p>
              {state?.answeredCount ?? 0} / {state?.players.length ?? 0}{" "}
              answered
            </p>
            <Progress
              value={
                ((state?.answeredCount ?? 0) /
                  Math.max(1, state?.players.length ?? 0)) *
                100
              }
            />
          </>
        )}
      </main>
    </div>
  );
}
