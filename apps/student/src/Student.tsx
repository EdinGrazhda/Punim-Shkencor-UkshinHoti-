import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Flame,
  LockKeyhole,
  Orbit,
  ScanLine,
  Shield,
  Sparkles,
  Star,
  Users,
  Wifi,
  Zap,
  Gem,
  Waves,
  Leaf,
  CircleDot,
} from "lucide-react";
import type { PublicSessionState } from "@ckadinti/contracts";
import {
  api,
  ApiRequestError,
  type PlayerIdentity,
  type PlayerResult,
  type Leaderboard,
  watchSession,
} from "./api";
import { Badge, Button, Card, Input, Progress } from "./ui";
import { createUuid, formatTime } from "./utils";
import "./Brand.css";

const emblems = [
  { name: "Comet", label: "Fast learner", Icon: Sparkles, color: "#ffba76" },
  { name: "Prism", label: "Creative thinker", Icon: Gem, color: "#aa8cff" },
  { name: "Orbit", label: "Big picture", Icon: Orbit, color: "#7dd6ff" },
  { name: "Spark", label: "Bright ideas", Icon: Zap, color: "#ffd671" },
  { name: "Wave", label: "Calm explorer", Icon: Waves, color: "#73d8e9" },
  { name: "Leaf", label: "Curious mind", Icon: Leaf, color: "#9ce6b2" },
  { name: "Shield", label: "Strong teammate", Icon: Shield, color: "#8aa9ff" },
  { name: "Nova", label: "Star thinker", Icon: Star, color: "#ffa6d4" },
  { name: "Pulse", label: "Always moving", Icon: CircleDot, color: "#fbada6" },
];

function Emblem({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "large";
}) {
  const item = emblems.find((e) => e.name === name) ?? emblems[0]!;
  const Icon = item.Icon;
  return (
    <span
      className={`emblem emblem-${size}`}
      style={{ "--emblem": item.color } as React.CSSProperties}
    >
      <Icon size={size === "large" ? 36 : 20} strokeWidth={2.3} />
    </span>
  );
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`brand ${dark ? "brand-dark" : ""}`}>
      <span className="brand-mark">
        <img src="/images/ckadinti-thinking-mascot-v2.png" alt="" />
      </span>
      CkaDinTi<span className="brand-dot">.</span>
    </span>
  );
}

export function Student() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [step, setStep] = useState<"join" | "lobby">("join");
  const [name, setName] = useState(
    () => sessionStorage.getItem("ckadinti-student-name") ?? "",
  );
  const [emblem, setEmblem] = useState("Comet");
  const [identity, setIdentity] = useState<PlayerIdentity | null>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("ckadinti-player") ?? "null",
      ) as PlayerIdentity | null;
    } catch {
      return null;
    }
  });
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "reconnecting" | "rejoin">(() => identity ? "reconnecting" : "connected");
  const [connectionRetry, setConnectionRetry] = useState(0);

  // Keep socket updates snappy, but reconcile periodically with the authoritative
  // session endpoint so a dropped socket event cannot strand a student on reveal.
  const applySessionState = useCallback((next: PublicSessionState) => {
    setIdentity(current => {
      if (!current) return current;
      const player = next.players.find(candidate => candidate.id === current.id);
      if (!player) return current;
      const updated = { ...current, name: player.displayName, emblem: player.emblem ?? current.emblem };
      if (updated.name !== current.name || updated.emblem !== current.emblem) localStorage.setItem("ckadinti-player", JSON.stringify(updated));
      return updated;
    });
    setState((current) => {
      if (current && (next.questionIndex ?? -1) < (current.questionIndex ?? -1))
        return current;
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!identity) return;
    setName(identity.name);
    setEmblem(identity.emblem);
  }, [identity?.name, identity?.emblem]);
  useEffect(() => {
    if (!identity) return;
    setStep("lobby");
    setCode(identity.code);
    setName(identity.name);
    setEmblem(identity.emblem);
    let syncing = false;
    let restoring = false;
    let retryTimer: number | undefined;
    let retryDelay = 1_000;
    let active = true;
    const expireIdentity = (cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error("Your player session is no longer available.");
      localStorage.removeItem("ckadinti-player");
      setIdentity(null);
      setStep("join");
      setConnectionStatus("rejoin");
      setError(error.message.includes("rejoin") ? error.message : "Your connection expired. Please rejoin the classroom.");
    };
    const isExpired = (cause: unknown) => cause instanceof ApiRequestError && (cause.status === 401 || cause.status === 404 || cause.code === "player_not_found");
    const scheduleRestore = () => {
      if (!active || retryTimer !== undefined) return;
      setConnectionStatus("reconnecting");
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void restore();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    };
    const restore = async () => {
      if (!active || restoring) return;
      restoring = true;
      setConnectionStatus("reconnecting");
      try {
        const response = await api.reconnect(identity);
        if (!active) return;
        applySessionState(response.state);
        setIdentity(current => {
          if (!current || current.id !== identity.id) return current;
          const updated = { ...current, name: response.player.displayName, emblem: response.player.emblem ?? current.emblem };
          localStorage.setItem("ckadinti-player", JSON.stringify(updated));
          return updated;
        });
        setConnectionStatus("connected");
        setError("");
        retryDelay = 1_000;
      } catch (cause) {
        if (!active) return;
        if (isExpired(cause)) expireIdentity(cause);
        else scheduleRestore();
      } finally {
        restoring = false;
      }
    };
    const socket = watchSession(identity.code, applySessionState, connected => {
      if (connected) void restore();
      else scheduleRestore();
    }, identity);
    const reconcile = async () => {
      if (syncing) return;
      syncing = true;
      try {
        applySessionState(await api.state(identity.code));
        setResult(await api.me(identity));
        setConnectionStatus("connected");
      } catch (cause) {
        if (isExpired(cause)) expireIdentity(cause);
        else scheduleRestore();
      } finally {
        syncing = false;
      }
    };
    void restore();
    void reconcile();
    const timer = window.setInterval(() => {
      void reconcile();
    }, 2_000);
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.clearInterval(timer);
      socket.disconnect();
    };
  }, [identity?.code, identity?.id, connectionRetry, applySessionState]);
  useEffect(() => {
    if (state?.phase === "question") {
      setSelected(null);
      setError("");
    }
  }, [state?.questionIndex]);
  useEffect(() => {
    if (!identity || !state) return;
    if (state.phase === "reveal")
      api
        .me(identity)
        .then(setResult)
        .catch((e) => setError(e.message));
    if (state.phase === "ended")
      api
        .results(identity.code)
        .then(setLeaderboard)
        .catch((e) => setError(e.message));
  }, [state?.phase, state?.questionIndex, identity?.id]);

  async function validateCode() {
    setBusy(true);
    setError("");
    try {
      const next = await api.state(code.trim().toUpperCase());
      if (next.phase !== "lobby" || next.lobbyLocked)
        throw new Error("This lobby is closed.");
      if ((next.nicknameMode ?? "student-choice") === "student-choice" && !name.trim())
        throw new Error("This game needs a nickname. Go back and enter one, or ask your teacher to enable classroom aliases.");
      setCode(next.code);
      await join(next.code, next.nicknameMode ?? "student-choice");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join(sessionCode: string, nicknameMode: "student-choice" | "assigned") {
    let studentToken: string | undefined;
    try {
      const account = JSON.parse(
        localStorage.getItem("ckadinti-student-account") ?? "null",
      ) as { token?: string; student?: { id: string } } | null;
      if (account?.token) {
        const verified = await api.studentMe(account.token);
        if (verified.student.id === account.student?.id)
          studentToken = account.token;
        else localStorage.removeItem("ckadinti-student-account");
      }
    } catch {
      localStorage.removeItem("ckadinti-student-account");
    }
    const joined = await api.join(
      sessionCode,
      nicknameMode === "assigned" ? undefined : name.trim(),
      emblem,
      studentToken,
    );
    const next: PlayerIdentity = {
      code: sessionCode,
      id: joined.player.id,
      token: joined.playerToken,
      name: joined.player.displayName,
      emblem: joined.player.emblem ?? emblem,
    };
    localStorage.setItem("ckadinti-player", JSON.stringify(next));
    setIdentity(next);
    applySessionState(joined.state);
    setStep("lobby");
  }
  async function answer(index: number) {
    if (!identity || !state?.question || selected !== null || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.answer(
        identity,
        state.question.index,
        index,
        createUuid(),
      );
      if (!response.accepted)
        throw new Error(response.reason ?? "Answer not accepted.");
      setSelected(index);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function leave() {
    localStorage.removeItem("ckadinti-player");
    setIdentity(null);
    setState(null);
    setStep("join");
    setSelected(null);
    navigate("/join");
  }

  if (step === "join" && !identity)
    return (
      <div className="student-page join-page">
        <div className="join-art" />
        <header className="student-header">
          <Brand />
          <a className="subtle-link" href="/join">
            <ArrowLeft size={16} /> Change name
          </a>
        </header>
        <div className="join-layout">
          <div className="join-copy">
            <Badge className="game-badge">STEP 2 OF 2 · JOIN A QUIZ</Badge>
            <h1>
              Ready for the
              <br />
              <em>challenge?</em>
            </h1>
            <p>
              You're joining as {name}. Enter the code from your teacher to
              start the mission.
            </p>
            <div className="join-benefits">
              <span>
                <Star size={17} /> Earn mission points
              </span>
            </div>
          </div>
          <Card className="join-card">
            <div className="card-orb">
              <Orbit size={26} />
            </div>
            <h2>Enter your game code</h2>
            <p>Ask your teacher for the six-character code.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void validateCode();
              }}
            >
              <label htmlFor="join-code">Classroom code</label>
              <Input
                id="join-code"
                className="code-input"
                value={code}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="K7H3M2"
                onChange={(e) =>
                  setCode(
                    e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase(),
                  )
                }
                required
              />
              <Button disabled={busy || code.length !== 6} type="submit">
                {busy ? "Checking code…" : "Join Game"}
                <ArrowRight size={18} />
              </Button>
            </form>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </Card>
        </div>
        <footer className="join-footer">
          A little courage. A lot of curiosity. ✦
        </footer>
      </div>
    );

  const phase = state?.phase ?? "lobby";
  const question = state?.question;
  const currentResult =
    result?.questionIndex === state?.questionIndex ? result : null;
  const feedback =
    (phase === "reveal" || phase === "ended") && currentResult
      ? currentResult
      : null;
  const locked = selected !== null || currentResult?.answered;
  const totalPlayers = state?.players.length ?? 0;
  const ownPlayer = state?.players.find(player => player.id === identity?.id);
  const remaining = question ? phase === "paused" ? question.remainingMs ?? Math.max(0, question.deadlineAt - now) : Math.max(0, question.deadlineAt - now) : 0;
  const gameRemaining = state?.sessionDeadlineAt ? Math.max(0, state.sessionDeadlineAt - now) : state?.sessionRemainingMs ?? 0;
  const progressPercent = state?.sessionMode === "timed-repeat" && state.sessionDurationMs
    ? ((state.sessionDurationMs - gameRemaining) / state.sessionDurationMs) * 100
    : question ? (question.index / state.questionCount) * 100 : 0;
  const answerRemainingPercent = question ? (remaining / question.timeLimitMs) * 100 : 0;
  const myRank =
    leaderboard && identity
      ? leaderboard.leaderboard.findIndex((p) => p.id === identity.id) + 1
      : 0;

  return (
    <div className={`student-page game-page phase-${phase}`}>
      <div className="game-backdrop" />
      <header className="student-header game-header">
        <Brand />
        <div className="top-pills">
          <span>
            <Users size={16} /> {totalPlayers}{" "}
            {totalPlayers === 1 ? "player" : "players"}
          </span>
          <span>
            <Wifi size={16} /> {connectionStatus === "connected" ? "Connected" : connectionStatus === "rejoin" ? "Rejoin needed" : "Reconnecting…"}
          </span>
          {connectionStatus === "reconnecting" && <button type="button" className="connection-retry" onClick={() => setConnectionRetry(value => value + 1)}>Retry</button>}
          {ownPlayer?.teamName && <Badge className="team-pill">{ownPlayer.teamName}</Badge>}
        </div>
      </header>
      <AnimatePresence mode="wait">
        {phase === "lobby" && (
          <motion.main
            key="lobby"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="lobby-main"
          >
            <Badge className="light-badge">YOU'RE IN THE LOBBY</Badge>
            <Emblem name={emblem} size="large" />
            <h1>You're in!</h1>
            <p>The next adventure starts when your teacher is ready.</p>
            {ownPlayer?.teamName && <Badge className="team-pill">You're playing for {ownPlayer.teamName}</Badge>}
            <div className="lobby-panel">
              <div className="lobby-heading">
                <div>
                  <h2>Mission crew</h2>
                  <span>Players joining now</span>
                </div>
                <Badge>{totalPlayers} / 24</Badge>
              </div>
              <div className="player-grid">
                {state?.players.map((p, i) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="player-chip"
                    key={p.id}
                  >
                    <Emblem
                      name={
                        p.id === identity?.id
                          ? emblem
                          : emblems[i % emblems.length]!.name
                      }
                    />
                    <span>
                      {p.displayName}
                      {p.id === identity?.id ? " (you)" : ""}
                    </span>
                    {p.teamName && <Badge className="team-pill">{p.teamName}</Badge>}
                    <span
                      className={`status-dot ${p.connected ? "online" : ""}`}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="lobby-bottom">
              <div>
                <small>GAME CODE</small>
                <strong>{state?.code}</strong>
              </div>
              <Button
                variant="light"
                onClick={() => navigator.clipboard.writeText(state?.code ?? "")}
                aria-label="Copy game code"
              >
                <ClipboardCopy size={18} /> Copy
              </Button>
            </div>
            <button className="leave-link" onClick={leave}>
              Leave lobby
            </button>
          </motion.main>
        )}
        {(phase === "question" || phase === "paused") && question && (
          <motion.main
            key={`question-${question.index}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="question-shell"
          >
            <div className="question-top">
              <div>
                <Badge className="light-badge">CYBER SECURITY</Badge>
                <p>
                  {state.sessionMode === "timed-repeat" ? `Question ${question.index + 1} · repeat mode` : `Question ${question.index + 1} of ${state.questionCount}`}
                </p>
              </div>
              <div className="score-pills">
                {state.sessionMode === "timed-repeat" && <span className="timer-pill game-countdown">Game {formatTime(gameRemaining)}</span>}
                <span className="timer-pill" aria-label="Time to answer">Answer {formatTime(remaining)}</span>
              </div>
            </div>
            <Progress value={progressPercent} />
            <div
              className={`question-content ${feedback?.correct ? "showing-reward" : ""}`}
            >
              <img
                src="/images/password-quest.png"
                alt="Glowing lock on a laptop in a floating-island academy"
              />
              <div className="question-panel">
                {!feedback?.correct && (
                  <>
                    <div className="question-eyebrow">
                      <LockKeyhole size={16} /> MISSION QUESTION
                    </div>
                    <h1>{question.prompt}</h1>
                    <div className="answer-list">
                      {question.options.map((option, i) => (
                        <motion.button
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.99 }}
                          key={option}
                          className={`answer-capsule ${feedback?.answered && i === feedback.correctOption ? "answer-correct" : feedback?.answered && i === feedback.selectedOption ? "answer-incorrect" : ""}`}
                          onClick={() => void answer(i)}
                          disabled={
                            busy ||
                            Boolean(locked) ||
                            phase === "paused" ||
                            remaining === 0
                          }
                        >
                          <span className="answer-letter">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{option}</span>
                          {feedback?.answered &&
                          i === feedback.correctOption ? (
                            <span>✓ Correct</span>
                          ) : feedback?.answered &&
                            i === feedback.selectedOption ? (
                            <span>✕ Your answer</span>
                          ) : (
                            <ArrowRight size={18} />
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </>
                )}
                {currentResult?.answered && (
                  <p className="answer-locked-note" role="status">
                    Answer submitted. Your result will appear when your teacher
                    reveals this question.
                  </p>
                )}
                {phase === "paused" && (
                  <p className="paused-note">
                    Your teacher has paused this round.
                  </p>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </div>
            <Progress value={answerRemainingPercent} className="timer-progress" />
          </motion.main>
        )}
        {phase === "reveal" && (
          <motion.main
            key="reveal"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="feedback-shell"
          >
            <div className="feedback-icon">
              <Check size={44} />
            </div>
            <Badge className="light-badge">
              QUESTION {(state?.questionIndex ?? 0) + 1} REVEAL
            </Badge>
            <h1>{result?.correct ? "Excellent work!" : "Keep exploring!"}</h1>
            <p>
              {result?.correct
                ? "You found the strongest answer."
                : "Every mission is a chance to learn."}
            </p>
            <div className="feedback-stats">
              <span>
                <Star size={18} /> +{feedback?.questionXp ?? 0} XP · +
                {feedback?.questionScore ?? 0} points
              </span>
              <span>
                <Flame size={18} /> {result?.streak ?? 0} streak
              </span>
            </div>
            <Card className="explanation-card">
              <small>THE RIGHT ANSWER</small>
              <strong>
                {state?.question?.options[state?.reveal?.correctOption ?? 0]}
              </strong>
              <p>
                {state?.reveal?.explanation ??
                  "The teacher will explain this answer."}
              </p>
            </Card>
            <Card className="mission-card">
              <div>
                <strong>Mission progress</strong>
                <small>{state?.sessionMode === "timed-repeat" ? "Questions answered before time runs out" : `Answer ${state?.questionCount ?? 0} questions`}</small>
              </div>
              <span>
                {state?.sessionMode === "timed-repeat" ? `Question ${(state?.questionIndex ?? 0) + 1}` : `${(state?.questionIndex ?? 0) + 1} / ${state?.questionCount ?? 0}`}
              </span>
              <Progress
                value={
                  state?.sessionMode === "timed-repeat" ? progressPercent : (((state?.questionIndex ?? 0) + 1) / (state?.questionCount ?? 1)) * 100
                }
              />
            </Card>
            <p className="wait-next">Next question starts automatically…</p>
          </motion.main>
        )}
        {phase === "ended" && (
          <motion.main
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="results-shell"
          >
            <Badge className="light-badge">MISSION COMPLETE</Badge>
            <h1>Look how far you've come.</h1>
            <p>Every question brought your class a little further.</p>
            <div className="result-summary">
              <Card>
                <small>FINAL SCORE</small>
                <strong>
                  {leaderboard?.leaderboard.find((p) => p.id === identity?.id)
                    ?.score ?? 0}
                </strong>
                <Star size={22} />
              </Card>
              <Card>
                <small>YOUR RANK</small>
                <strong>#{myRank || "—"}</strong>
                <Sparkles size={22} />
              </Card>
              <Card>
                <small>QUESTIONS</small>
                <strong>{leaderboard?.questions ?? 5}</strong>
                <CheckCircle2 size={22} />
              </Card>
            </div>
            <Card className="leaderboard-card">
              <div className="section-title">
                <h2>Classroom ranking</h2>
                <Badge>{totalPlayers} players</Badge>
              </div>
              {leaderboard?.leaderboard.map((p, i) => (
                <div
                  className={`leader-row ${p.id === identity?.id ? "mine" : ""}`}
                  key={p.id}
                >
                  <span className="rank">{i + 1}</span>
                  <Emblem
                    name={
                      p.id === identity?.id
                        ? emblem
                        : emblems[i % emblems.length]!.name
                    }
                  />
                  <strong>{p.displayName}</strong>
                  <span>{p.score.toLocaleString()} pts</span>
                </div>
              ))}
            </Card>
            {leaderboard?.teams && leaderboard.teams.length > 0 && <Card className="leaderboard-card team-leaderboard-card">
              <div className="section-title"><h2>Team standings</h2><Badge>{leaderboard.teams.length} teams</Badge></div>
              {leaderboard.teams.map((team, index) => <div className="leader-row" key={team.id}><span className="rank">{index + 1}</span><strong>{team.name}</strong><span>{team.players} {team.players === 1 ? "player" : "players"}</span><span>{team.score.toLocaleString()} pts</span></div>)}
            </Card>}
            <Button variant="light" onClick={leave}>
              Back to join <ArrowRight size={18} />
            </Button>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}

export { Brand, Emblem };
