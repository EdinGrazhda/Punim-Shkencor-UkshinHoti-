import { useEffect, useRef, useState } from "react";
import type { HostCommand, PublicSessionState } from "@ckadinti/contracts";
import type { HostedResults, HostedSession } from "../main/services/runtime-host.js";

export function HostWorkspace({ reportsOnly = false }: { reportsOnly?: boolean }) {
  const [sessions, setSessions] = useState<HostedSession[]>([]);
  const [code, setCode] = useState("");
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [results, setResults] = useState<HostedResults | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seconds, setSeconds] = useState(30);
  const [remaining, setRemaining] = useState(0);
  const revision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void window.teacherBridge.listHostSessions().then(result => {
      if (cancelled) return;
      if (!result.ok || !result.data) throw new Error(result.error?.message ?? "Could not load sessions.");
      setSessions(result.data);
      setCode(result.data[0]?.code ?? "");
    }).catch(error => { if (!cancelled) setError(String(error.message)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let loadedResults = false;
    setState(null); setResults(null); setError(""); setNotice("");
    const poll = async () => {
      const requestRevision = revision.current;
      try {
        const response = await window.teacherBridge.getHostState(code);
        if (cancelled || requestRevision !== revision.current) return;
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Could not refresh the game.");
        setState(response.data); setError("");
        if (response.data.phase === "ended" && !loadedResults) {
          const report = await window.teacherBridge.getHostResults(code);
          if (cancelled) return;
          if (!report.ok || !report.data) throw new Error(report.error?.message ?? "Could not load results.");
          setResults(report.data); loadedResults = true;
        }
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "The runtime is unavailable.");
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); revision.current += 1; };
  }, [code]);

  useEffect(() => {
    const tick = () => setRemaining(state?.question ? Math.max(0, Math.ceil((state.question.deadlineAt - Date.now()) / 1000)) : 0);
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [state]);

  async function command(command: HostCommand) {
    if (busy || !code) return;
    if (command.type === "end" && !window.confirm("End this classroom game now?")) return;
    setBusy(true); setError(""); revision.current += 1;
    try {
      const response = await window.teacherBridge.sendHostCommand(code, command);
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "The host could not apply the command.");
      setState(response.data);
    } catch (error) { setError(error instanceof Error ? error.message : "Command failed."); }
    finally { revision.current += 1; setBusy(false); }
  }

  async function copyLink(link: string) {
    try { await navigator.clipboard.writeText(link); setNotice("Student link copied."); }
    catch { setError("Select and copy the student link below."); }
  }

  const session = sessions.find(item => item.code === code);
  const localLink = session && /\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(session.joinUrl);
  return <section className="host-workspace">
    <p>Sessions opened in this desktop workspace. Runtime restarts erase games; desktop restarts clear this session list.</p>
    {error && <p className="error-note" role="alert">{error}</p>}
    {notice && <p className="file-note" role="status">{notice}</p>}
    {loading ? <p>Loading sessions…</p> : sessions.length === 0 ? <div className="empty-state"><strong>No classroom sessions yet</strong><span>Open an approved quiz under Quizzes and choose Start LAN session.</span></div> : <>
      <label>Classroom session<select value={code} disabled={busy} onChange={event => setCode(event.target.value)}>{sessions.map(item => <option key={item.code} value={item.code}>{item.title} · {item.code}</option>)}</select></label>
      {session && <article className="source-block"><h2>{session.title}</h2><p>Join code: <strong>{session.code}</strong> · {session.questionCount} questions</p><p className="join-link">{session.joinUrl}</p><button type="button" className="secondary" onClick={() => void copyLink(session.joinUrl)}>Copy student link</button>{localLink && <p className="file-note">This link works on this computer only. For other devices, configure the runtime STUDENT_ORIGIN with this computer’s LAN address and restart the host before creating a session.</p>}</article>}
      {state && <>
        <p role="status">{state.phase} · {state.players.length} players · {state.answeredCount} answers{state.phase === "question" ? ` · ${remaining}s remaining` : ""}</p>
        {!reportsOnly && <>
          <div className="review-actions">
            {state.phase === "lobby" && <><button className="primary" disabled={busy || Boolean(error)} onClick={() => void command({ type: "start" })}>Start game</button><button className="secondary" disabled={busy} onClick={() => void command({ type: "lock-lobby", locked: !state.lobbyLocked })}>{state.lobbyLocked ? "Unlock lobby" : "Lock lobby"}</button><label>Seconds per question<input type="number" min={1} max={600} value={seconds} onChange={event => setSeconds(Number(event.target.value))} /></label><button className="secondary" disabled={busy || !Number.isInteger(seconds) || seconds < 1 || seconds > 600} onClick={() => void command({ type: "set-timer", timeLimitMs: seconds * 1000 })}>Apply timer</button></>}
            {state.phase === "question" && <><button className="secondary" disabled={busy} onClick={() => void command({ type: "pause" })}>Pause</button><button className="secondary" disabled={busy} onClick={() => void command({ type: "reveal" })}>Reveal answer</button></>}
            {state.phase === "paused" && <button className="primary" disabled={busy} onClick={() => void command({ type: "resume" })}>Resume</button>}
            {state.phase === "reveal" && <button className="primary" disabled={busy} onClick={() => void command({ type: "next" })}>Next question / finish</button>}
            {state.phase !== "ended" && <button className="danger" disabled={busy} onClick={() => void command({ type: "end" })}>End game</button>}
          </div>
          {state.question && <article className="source-block"><h3>Question {state.question.index + 1}: {state.question.prompt}</h3><ol>{state.question.options.map((option, index) => <li key={index}>{option}{state.reveal?.correctOption === index ? " — Correct answer" : ""}</li>)}</ol>{state.reveal?.explanation && <p>{state.reveal.explanation}</p>}</article>}
          <h3>Players</h3><ul className="host-players">{state.players.map(player => <li key={player.id}><span>{player.displayName} · {player.connected ? "Connected" : "Disconnected"}</span>{state.phase !== "ended" && <button className="danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${player.displayName} from this game?`)) void command({ type: "kick", playerId: player.id }); }}>Remove</button>}</li>)}</ul>
        </>}
        {state.phase !== "ended" && reportsOnly && <p>Detailed results become available when the game ends. Open Games for live controls.</p>}
        {results && <article className="source-block"><h2>Classroom results</h2><p>{results.leaderboard.length} players · {results.questions} questions. Scores are supplied by the game host.</p>{results.leaderboard.map(player => <details key={player.id}><summary>{player.displayName} — {player.score} points</summary><table className="host-results"><thead><tr><th>Question</th><th>Answer</th><th>Correct answer</th><th>Points</th></tr></thead><tbody>{player.answers.map(answer => <tr key={answer.questionIndex}><td>{answer.prompt}</td><td>{answer.answered ? answer.selectedAnswer : "No answer"}{answer.correct ? " ✓" : ""}</td><td>{answer.correctAnswer}</td><td>{answer.score}</td></tr>)}</tbody></table></details>)}</article>}
      </>}
    </>}
  </section>;
}
