import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function StudentApp() {
  const [joined, setJoined] = useState(false); const [name, setName] = useState(""); const [code, setCode] = useState("");
  return <main><section className="card"><p className="eyebrow">CKADINTI · CLASSROOM RAID</p><h1>{joined ? "You’re in." : "Join the mission"}</h1>{joined ? <><p className="muted">Waiting for your teacher to start the round.</p><div className="code">{code.toUpperCase()}</div><p className="muted">Keep this tab open. Your progress will reconnect if your Wi-Fi blinks.</p></> : <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && code.trim()) setJoined(true); }}><label>Mission code<input value={code} onChange={e => setCode(e.target.value)} placeholder="ABC123" maxLength={6} /></label><label>Display name<input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={32} /></label><button>Enter lobby</button></form>}</section></main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><StudentApp /></React.StrictMode>);
