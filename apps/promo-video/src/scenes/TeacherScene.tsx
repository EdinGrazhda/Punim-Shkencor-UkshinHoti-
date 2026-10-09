import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {BrowserFrame, Cursor} from "../components/BrowserFrame";
import {TeacherUi} from "../components/ProductUi";
import {Kicker} from "../components/Typography";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

export const TeacherScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cursorX = interpolate(frame, [0, 3.2*fps, 5.6*fps, 11*fps], [1010, 1110, 1235, 1420], {...clamp});
  const cursorY = interpolate(frame, [0, 3.2*fps, 5.6*fps, 11*fps], [650, 475, 694, 350], {...clamp});
  return (
    <SceneShell style={{backgroundColor: COLORS.mist}}>
      <Ambient light />
      <AbsoluteFill style={{padding: "88px 108px"}}>
        <div style={{position: "relative", zIndex: 5, display: "flex", justifyContent: "space-between", alignItems: "end"}}><div><Kicker>AI FOR TEACHERS</Kicker><h1 style={{margin: "13px 0 0", color: COLORS.navy, fontSize: 76, lineHeight: 1, letterSpacing: "-.055em"}}>LESS PREPARATION.<br /><span style={{color: COLORS.periwinkle}}>MORE TEACHING.</span></h1></div><p style={{maxWidth: 520, margin: "0 0 8px", color: "#64718C", fontSize: 21, lineHeight: 1.5}}>Transform trusted lesson material into reviewable classroom activities—without giving up teacher control.</p></div>
        <BrowserFrame url="teacher.ckadinti.local/quiz-studio" style={{position: "absolute", width: 1570, height: 780, left: 175, top: 260, rotate: ".7deg", scale: interpolate(frame,[0,1.2*fps,16*fps],[.93,1,1.035],{...clamp,easing:Easing.bezier(.16,1,.3,1),output:"perceptual-scale"})}}><TeacherUi /><Cursor x={cursorX} y={cursorY} click={(frame>3.05*fps&&frame<3.35*fps)||(frame>5.45*fps&&frame<5.8*fps)||(frame>10.8*fps&&frame<11.15*fps)} /></BrowserFrame>
        <div style={{position: "absolute", left: 82, top: 625, width: 190, height: 190, borderRadius: 999, border: "1px solid rgba(115,132,232,.28)", opacity: .8}}><div style={{position:"absolute",inset:28,borderRadius:999,border:"1px solid rgba(115,132,232,.4)"}} /><div style={{position:"absolute",inset:65,borderRadius:999,background:COLORS.periwinkle,boxShadow:"0 0 45px rgba(115,132,232,.45)"}} /></div>
        <svg style={{position:"absolute",left:220,top:645,width:140,height:70,overflow:"visible",opacity:.6}}><path d="M0 34 C45 0 90 70 140 35" fill="none" stroke={COLORS.periwinkle} strokeWidth="3" strokeDasharray="8 10" strokeDashoffset={-frame*1.2}/></svg>
        <div style={{position:"absolute",right:98,bottom:65,padding:"15px 20px",borderRadius:14,background:COLORS.navy,color:"white",fontWeight:900,boxShadow:"0 18px 45px rgba(0,0,78,.25)",opacity:interpolate(frame,[9*fps,9.6*fps],[0,1],{...clamp})}}>✓ TEACHER REVIEW REMAINS MANDATORY</div>
      </AbsoluteFill>
    </SceneShell>
  );
};
