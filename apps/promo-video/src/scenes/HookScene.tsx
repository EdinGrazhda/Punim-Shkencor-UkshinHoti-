import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {BrowserFrame} from "../components/BrowserFrame";
import {LandingUi} from "../components/ProductUi";
import {RevealText} from "../components/Typography";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const switchAt = 3.4 * fps;
  return (
    <SceneShell>
      <Ambient />
      <AbsoluteFill style={{padding: "110px 120px"}}>
        <div style={{position: "absolute", inset: 0, opacity: interpolate(frame, [0, switchAt - 10, switchAt + 12], [1, 1, 0], {...clamp}), filter: `grayscale(1) blur(${interpolate(frame, [switchAt - 14, switchAt + 8], [0, 12], {...clamp})}px)`}}>
          <div style={{position: "absolute", left: 210, top: 230, width: 540, height: 560, padding: 45, rotate: "-4deg", borderRadius: 8, background: "#E8E8E4", color: "#3C3C43", boxShadow: "0 45px 100px rgba(0,0,0,.35)"}}><small style={{letterSpacing: ".2em"}}>CLASSROOM WORKSHEET</small><h2 style={{fontFamily: "Georgia,serif", fontSize: 38, margin: "25px 0"}}>Digital citizenship quiz</h2>{["What makes a password secure?","Why should passwords be unique?","When is MFA useful?"].map((q,i)=><div key={q} style={{margin: "26px 0", fontFamily: "Georgia,serif", fontSize: 20}}>{i+1}. {q}<div style={{height: 1, marginTop: 20, background: "#8B8B89"}} /></div>)}</div>
          <div style={{position: "absolute", right: 210, top: 290, width: 470, height: 430, padding: 40, rotate: "5deg", borderRadius: 8, background: "#F3F0E8", color: "#4B4A46", boxShadow: "0 45px 100px rgba(0,0,0,.35)"}}><div style={{fontSize: 82, textAlign: "center", opacity: .65}}>?</div><h3 style={{fontFamily: "Georgia,serif", textAlign: "center", fontSize: 30}}>Same questions.<br />Same routine.</h3><p style={{fontFamily: "Georgia,serif", textAlign: "center", lineHeight: 1.6}}>What if the classroom could feel different?</p></div>
        </div>
        <div style={{position: "absolute", inset: 0, opacity: interpolate(frame, [switchAt - 8, switchAt + 20], [0, 1], {...clamp}), scale: interpolate(frame, [switchAt - 10, switchAt + 38, 10 * fps], [1.18, 1, .94], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale"})}}>
          <BrowserFrame style={{position: "absolute", width: 1390, height: 770, left: 265, top: 190, rotate: "-1.5deg"}}><LandingUi /></BrowserFrame>
          <div style={{position: "absolute", left: 115, top: 86, padding: "12px 18px", borderRadius: 99, color: COLORS.navy, background: COLORS.cyan, fontWeight: 900, letterSpacing: ".1em", boxShadow: "0 16px 40px rgba(98,216,240,.28)"}}>THE CLASSROOM, REIMAGINED</div>
        </div>
        <div style={{position: "absolute", left: 120, bottom: 100, zIndex: 10, opacity: interpolate(frame, [0, 1.1 * fps, 3.1 * fps, 3.5 * fps], [0, 1, 1, 0], {...clamp})}}><RevealText delay={0.4} size={92} maxWidth={1180}>WHAT IF LEARNING<br />FELT LIKE PLAYING?</RevealText></div>
        <div style={{position: "absolute", right: 110, top: 112, zIndex: 10, opacity: interpolate(frame, [5.1 * fps, 5.7 * fps], [0, 1], {...clamp})}}><RevealText delay={5.15} size={74} align="right" maxWidth={880}>AND TEACHING<br /><span style={{color: COLORS.cyan}}>BECAME SMARTER?</span></RevealText></div>
      </AbsoluteFill>
    </SceneShell>
  );
};
