import React from "react";
import {Img, staticFile} from "remotion";
import {COLORS} from "../theme";

export const Brand: React.FC<{dark?: boolean; size?: number}> = ({dark = false, size = 34}) => (
  <div style={{display: "flex", alignItems: "center", gap: 12, color: dark ? COLORS.white : COLORS.navy, fontSize: size, fontWeight: 900, letterSpacing: "-0.04em"}}>
    <span style={{width: size * 1.25, height: size * 1.25, display: "grid", placeItems: "center", overflow: "hidden", borderRadius: size * 0.38, backgroundColor: dark ? "rgba(255,255,255,.12)" : "#EEF1FF"}}><Img src={staticFile("images/ckadinti-thinking-mascot-v2.png")} style={{width: "92%", height: "92%", objectFit: "contain"}} /></span>
    CkaDinTi<span style={{color: COLORS.violet}}>.</span>
  </div>
);
