import React from "react";
import {interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, clamp} from "../theme";

export const BrowserFrame: React.FC<{
  children: React.ReactNode;
  url?: string;
  compact?: boolean;
  style?: React.CSSProperties;
}> = ({children, url = "ckadinti.local", compact = false, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,.35)", borderRadius: compact ? 24 : 30, backgroundColor: COLORS.white, boxShadow: "0 45px 120px rgba(0,0,40,.35), 0 8px 25px rgba(0,0,78,.18)", opacity: interpolate(frame, [0, 0.45 * fps], [0, 1], {...clamp}), scale: interpolate(frame, [0, 0.8 * fps], [0.93, 1], {...clamp, output: "perceptual-scale"}), ...style}}>
      <div style={{height: compact ? 44 : 58, display: "flex", alignItems: "center", gap: 11, padding: compact ? "0 18px" : "0 24px", borderBottom: "1px solid #E8EBF5", background: "linear-gradient(180deg,#fff,#F8F9FD)"}}>
        <span style={{width: 11, height: 11, borderRadius: 99, backgroundColor: "#FF796B"}} />
        <span style={{width: 11, height: 11, borderRadius: 99, backgroundColor: "#FFC75F"}} />
        <span style={{width: 11, height: 11, borderRadius: 99, backgroundColor: "#5ED19A"}} />
        <div style={{height: compact ? 26 : 32, minWidth: 360, marginLeft: 18, display: "flex", alignItems: "center", gap: 9, padding: "0 14px", borderRadius: 9, backgroundColor: "#EEF1F7", color: "#7E88A0", fontSize: compact ? 13 : 15}}><span style={{fontSize: 11}}>●</span>{url}</div>
      </div>
      <div style={{position: "relative", height: `calc(100% - ${compact ? 44 : 58}px)`, overflow: "hidden"}}>{children}</div>
    </div>
  );
};

export const Cursor: React.FC<{x: number; y: number; click?: boolean}> = ({x, y, click = false}) => (
  <div style={{position: "absolute", zIndex: 50, left: x, top: y, width: 24, height: 30, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.28))", scale: click ? 0.82 : 1}}>
    <svg viewBox="0 0 26 32" width="26" height="32"><path d="M2 1l20 18-9 1 5 9-5 2-5-9-6 7V1z" fill="#fff" stroke="#00004E" strokeWidth="2" /></svg>
    {click && <span style={{position: "absolute", left: -11, top: -10, width: 42, height: 42, borderRadius: 99, border: "3px solid #7384E8", opacity: 0.6}} />}
  </div>
);
