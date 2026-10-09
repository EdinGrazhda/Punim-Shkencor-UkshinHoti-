import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {BrowserFrame, Cursor} from "../components/BrowserFrame";
import {LandingUi} from "../components/ProductUi";
import {Kicker, Pill} from "../components/Typography";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

export const PlatformScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <SceneShell>
      <Ambient />
      <AbsoluteFill style={{padding: "92px 108px"}}>
        <div style={{position: "absolute", left: 108, top: 103, zIndex: 20}}><Kicker light>INTRODUCING CKADINTI</Kicker><h1 style={{maxWidth: 910, margin: "17px 0 0", color: "white", fontSize: 73, lineHeight: 1.02, letterSpacing: "-.055em"}}>THE NEXT GENERATION<br />OF <span style={{color: COLORS.cyan}}>INTERACTIVE LEARNING</span></h1><p style={{marginTop: 18, color: "rgba(255,255,255,.7)", fontSize: 24}}>Powered by AI. Designed for education.</p></div>
        <BrowserFrame style={{position: "absolute", width: 1390, height: 760, right: -40, bottom: -125, rotate: "-2deg", perspective: 1000, scale: interpolate(frame, [0, 2.8 * fps, 12 * fps], [.86, 1, 1.08], {...clamp, easing: Easing.bezier(.16,1,.3,1), output: "perceptual-scale"}), translate: interpolate(frame, [0, 12 * fps], ["70px 80px", "-80px -30px"], {...clamp})}}><LandingUi /><Cursor x={interpolate(frame,[1.2*fps,5*fps],[1120,790],{...clamp})} y={interpolate(frame,[1.2*fps,5*fps],[580,430],{...clamp})} click={frame > 4.8*fps && frame < 5.15*fps} /></BrowserFrame>
        <div style={{position: "absolute", left: 112, bottom: 126, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 11, opacity: interpolate(frame, [2.4 * fps, 3.2 * fps], [0,1], {...clamp})}}><Pill tone="mint">✦ AI-GENERATED QUIZZES</Pill><Pill>◎ LIVE CLASSROOM MISSIONS</Pill><Pill tone="amber">◆ MEANINGFUL REWARDS</Pill></div>
      </AbsoluteFill>
    </SceneShell>
  );
};
