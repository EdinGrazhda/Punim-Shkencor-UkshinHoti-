import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCopy, Flame, LockKeyhole, Orbit, ScanLine, Shield, Sparkles, Star, Users, Wifi, Zap, Gem, Waves, Leaf, CircleDot } from "lucide-react";
import type { PublicSessionState } from "@ckadinti/contracts";
import { api, type PlayerIdentity, type PlayerResult, type Leaderboard, watchSession } from "./api";
import { Badge, Button, Card, Input, Progress } from "./ui";
import { formatTime } from "./utils";

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

function Emblem({ name, size = "normal" }: { name: string; size?: "normal" | "large" }) {
  const item = emblems.find(e => e.name === name) ?? emblems[0]!;
  const Icon = item.Icon;
  return <span className={`emblem emblem-${size}`} style={{ "--emblem": item.color } as React.CSSProperties}><Icon size={size === "large" ? 36 : 20} strokeWidth={2.3} /></span>;
}

function Brand({ dark = false }: { dark?: boolean }) { return <span className={`brand ${dark ? "brand-dark" : ""}`}><span className="brand-mark"><Sparkles size={18} fill="currentColor" /></span>CkaDinTi<span className="brand-dot">.</span></span>; }

export function Student() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [step, setStep] = useState<"join" | "lobby">("join");
  const [name, setName] = useState(() => sessionStorage.getItem("ckadinti-student-name") ?? "");
  const [emblem, setEmblem] = useState("Comet");
  const [identity, setIdentity] = useState<PlayerIdentity | null>(() => { try { return JSON.parse(localStorage.getItem("ckadinti-player") ?? "null") as PlayerIdentity | null; } catch { return null; } });
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Keep socket updates snappy, but reconcile periodically with the authoritative
  // session endpoint so a dropped socket event cannot strand a student on reveal.
  const applySessionState = useCallback((next: PublicSessionState) => {
    setState(current => {
      if (current && (next.questionIndex ?? -1) < (current.questionIndex ?? -1)) return current;
      return next;
    });
  }, []);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!identity && !name.trim()) navigate("/join", { replace: true }); }, [identity, name, navigate]);
  useEffect(() => { if (!identity) return; setStep("lobby"); setCode(identity.code); setName(identity.name); setEmblem(identity.emblem); api.reconnect(identity).then(r => applySessionState(r.state)).catch(() => { localStorage.removeItem("ckadinti-player"); setIdentity(null); setStep("join"); }); }, []);
  useEffect(() => {
    if (!identity) return;
    const socket = watchSession(identity.code, applySessionState);
    let syncing = false;
    const reconcile = async () => {
      if (syncing) return;
      syncing = true;
      try { applySessionState(await api.state(identity.code)); } catch { /* keep the last known view during brief network interruptions */ }
      finally { syncing = false; }
    };
    void reconcile();
    const timer = window.setInterval(() => { void reconcile(); }, 1500);
    return () => { window.clearInterval(timer); socket.disconnect(); };
  }, [identity?.code]);
  useEffect(() => { if (state?.phase === "question") setSelected(null); }, [state?.questionIndex]);
  useEffect(() => { if (!identity || !state) return; if (state.phase === "reveal") api.me(identity).then(setResult).catch(e => setError(e.message)); if (state.phase === "ended") api.results(identity.code).then(setLeaderboard).catch(e => setError(e.message)); }, [state?.phase, state?.questionIndex, identity?.id]);

  async function validateCode() { setBusy(true); setError(""); try { if (!name.trim()) { navigate("/join"); return; } const next = await api.state(code.trim().toUpperCase()); if (next.phase !== "lobby" || next.lobbyLocked) throw new Error("This lobby is closed."); setCode(next.code); await join(next.code); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function join(sessionCode: string) { const joined = await api.join(sessionCode, name.trim(), emblem); const next: PlayerIdentity = { code: sessionCode, id: joined.player.id, token: joined.playerToken, name: name.trim(), emblem }; localStorage.setItem("ckadinti-player", JSON.stringify(next)); setIdentity(next); applySessionState(joined.state); setStep("lobby"); }
  async function answer(index: number) { if (!identity || !state?.question || selected !== null) return; setBusy(true); setError(""); try { const response = await api.answer(identity, state.question.index, index, crypto.randomUUID()); if (!response.accepted) throw new Error(response.reason ?? "Answer not accepted."); setSelected(index); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function leave() { localStorage.removeItem("ckadinti-player"); setIdentity(null); setState(null); setStep("join"); setSelected(null); navigate("/join"); }

  if (step === "join" && !identity) return <div className="student-page join-page"><div className="join-art" /><header className="student-header"><Brand /><a className="subtle-link" href="/join"><ArrowLeft size={16} /> Change name</a></header><div className="join-layout"><div className="join-copy"><Badge className="game-badge">STEP 2 OF 2 · JOIN A QUIZ</Badge><h1>Ready for the<br /><em>challenge?</em></h1><p>You're joining as {name}. Enter the code from your teacher to start the mission.</p><div className="join-benefits"><span><Star size={17} /> Earn mission points</span></div></div><Card className="join-card"><div className="card-orb"><Orbit size={26} /></div><h2>Enter your game code</h2><p>Ask your teacher for the six-character code.</p><form onSubmit={e => { e.preventDefault(); void validateCode(); }}><label htmlFor="join-code">Classroom code</label><Input id="join-code" className="code-input" value={code} maxLength={6} autoComplete="off" autoCapitalize="characters" placeholder="K7H3M2" onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} required /><Button disabled={busy || code.length !== 6} type="submit">{busy ? "Checking code…" : "Join Game"}<ArrowRight size={18} /></Button></form>{error && <p className="form-error" role="alert">{error}</p>}</Card></div><footer className="join-footer">A little courage. A lot of curiosity. ✦</footer></div>;


  const phase = state?.phase ?? "lobby";
  const question = state?.question;
  const totalPlayers = state?.players.length ?? 0;
  const remaining = question ? Math.max(0, question.deadlineAt - now) : 0;
  const elapsedPercent = question ? remaining / question.timeLimitMs * 100 : 0;
  const myRank = leaderboard && identity ? leaderboard.leaderboard.findIndex(p => p.id === identity.id) + 1 : 0;

  return <div className={`student-page game-page phase-${phase}`}><div className="game-backdrop" /><header className="student-header game-header"><Brand /><div className="top-pills"><span><Users size={16} /> {totalPlayers} {totalPlayers === 1 ? "player" : "players"}</span><span><Wifi size={16} /> Connected</span></div></header><AnimatePresence mode="wait">
    {phase === "lobby" && <motion.main key="lobby" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="lobby-main"><Badge className="light-badge">YOU'RE IN THE LOBBY</Badge><Emblem name={emblem} size="large" /><h1>You're in!</h1><p>The next adventure starts when your teacher is ready.</p><div className="lobby-panel"><div className="lobby-heading"><div><h2>Mission crew</h2><span>Players joining now</span></div><Badge>{totalPlayers} / 24</Badge></div><div className="player-grid">{state?.players.map((p, i) => <motion.div layout initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} className="player-chip" key={p.id}><Emblem name={p.id === identity?.id ? emblem : emblems[i % emblems.length]!.name} /><span>{p.displayName}{p.id === identity?.id ? " (you)" : ""}</span><span className={`status-dot ${p.connected ? "online" : ""}`} /></motion.div>)}</div></div><div className="lobby-bottom"><div><small>GAME CODE</small><strong>{state?.code}</strong></div><Button variant="light" onClick={() => navigator.clipboard.writeText(state?.code ?? "")} aria-label="Copy game code"><ClipboardCopy size={18} /> Copy</Button></div><button className="leave-link" onClick={leave}>Leave lobby</button></motion.main>}
    {(phase === "question" || phase === "paused") && question && <motion.main key={`question-${question.index}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="question-shell"><div className="question-top"><div><Badge className="light-badge">CYBER SECURITY</Badge><p>Question {question.index + 1} of {state.questionCount}</p></div><div className="score-pills"><span><Flame size={17} /> {result?.streak ?? 0} streak</span><span><Star size={17} /> {result?.score ?? 0} pts</span><span className="timer-pill">{formatTime(remaining)}</span></div></div><Progress value={(question.index / state.questionCount) * 100} /><div className="question-content"><img src="/images/password-quest.png" alt="Glowing lock on a laptop in a floating-island academy" /><div className="question-panel"><div className="question-eyebrow"><LockKeyhole size={16} /> MISSION QUESTION</div><h1>{question.prompt}</h1>{selected === null ? <div className="answer-list">{question.options.map((option, i) => <motion.button whileHover={{ y: -2 }} whileTap={{ scale: .99 }} key={option} className="answer-capsule" onClick={() => void answer(i)} disabled={busy || phase === "paused"}><span className="answer-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span><ArrowRight size={18} /></motion.button>)}</div> : <div className="answer-locked"><CheckCircle2 size={42} /><h2>Answer locked in!</h2><p>Waiting for the rest of the class…</p><Badge>{state?.answeredCount} / {totalPlayers} answered</Badge></div>}{phase === "paused" && <p className="paused-note">Your teacher has paused this round.</p>}{error && <p className="form-error" role="alert">{error}</p>}</div></div><Progress value={elapsedPercent} className="timer-progress" /></motion.main>}
    {phase === "reveal" && <motion.main key="reveal" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="feedback-shell"><div className="feedback-icon"><Check size={44} /></div><Badge className="light-badge">QUESTION {(state?.questionIndex ?? 0) + 1} REVEAL</Badge><h1>{result?.correct ? "Excellent work!" : "Keep exploring!"}</h1><p>{result?.correct ? "You found the strongest answer." : "Every mission is a chance to learn."}</p><div className="feedback-stats"><span><Star size={18} /> +{result?.questionScore ?? 0} points</span><span><Flame size={18} /> {result?.streak ?? 0} streak</span></div><Card className="explanation-card"><small>THE RIGHT ANSWER</small><strong>{state?.question?.options[state?.reveal?.correctOption ?? 0]}</strong><p>{state?.reveal?.explanation ?? "The teacher will explain this answer."}</p></Card><Card className="mission-card"><div><strong>Mission progress</strong><small>Answer {state?.questionCount ?? 0} questions</small></div><span>{(state?.questionIndex ?? 0) + 1} / {state?.questionCount ?? 0}</span><Progress value={(((state?.questionIndex ?? 0) + 1) / (state?.questionCount ?? 1)) * 100} /></Card><p className="wait-next">Waiting for your teacher to open the next question…</p></motion.main>}
    {phase === "ended" && <motion.main key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="results-shell"><Badge className="light-badge">MISSION COMPLETE</Badge><h1>Look how far you've come.</h1><p>Every question brought your class a little further.</p><div className="result-summary"><Card><small>FINAL SCORE</small><strong>{leaderboard?.leaderboard.find(p => p.id === identity?.id)?.score ?? 0}</strong><Star size={22} /></Card><Card><small>YOUR RANK</small><strong>#{myRank || "—"}</strong><Sparkles size={22} /></Card><Card><small>QUESTIONS</small><strong>{leaderboard?.questions ?? 5}</strong><CheckCircle2 size={22} /></Card></div><Card className="leaderboard-card"><div className="section-title"><h2>Classroom ranking</h2><Badge>{totalPlayers} players</Badge></div>{leaderboard?.leaderboard.map((p, i) => <div className={`leader-row ${p.id === identity?.id ? "mine" : ""}`} key={p.id}><span className="rank">{i + 1}</span><Emblem name={p.id === identity?.id ? emblem : emblems[i % emblems.length]!.name} /><strong>{p.displayName}</strong><span>{p.score.toLocaleString()} pts</span></div>)}</Card><Button variant="light" onClick={leave}>Back to join <ArrowRight size={18} /></Button></motion.main>}
  </AnimatePresence></div>;
}

export { Brand, Emblem };
