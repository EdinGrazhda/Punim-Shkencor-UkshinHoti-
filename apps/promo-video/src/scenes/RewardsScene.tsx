import React from "react";
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {BrowserFrame} from "../components/BrowserFrame";
import {StudentQuestionUi} from "../components/ProductUi";
import {Kicker} from "../components/Typography";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

export const RewardsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opened = frame > 6.2*fps;
  const score = Math.round(interpolate(frame,[6.2*fps,8.2*fps],[4820,5070],{...clamp,easing:Easing.bezier(.16,1,.3,1)}));
  return (
    <SceneShell>
      <Ambient />
      <AbsoluteFill style={{padding:"84px 100px"}}>
        <div style={{textAlign:"center"}}><Kicker light>UNPREDICTABLE BY DESIGN</Kicker><h1 style={{margin:"15px auto 0",maxWidth:1320,color:"white",fontSize:72,lineHeight:1.02,letterSpacing:"-.055em"}}>EVERY ANSWER BRINGS<br /><span style={{color:COLORS.amber}}>A NEW POSSIBILITY.</span></h1></div>
        <BrowserFrame compact style={{position:"absolute",width:1060,height:660,left:430,top:300,scale:interpolate(frame,[0,1.2*fps],[.9,1],{...clamp,easing:Easing.bezier(.16,1,.3,1),output:"perceptual-scale"})}}><StudentQuestionUi variant="reward"/></BrowserFrame>
        <div style={{position:"absolute",left:155,top:470,width:300,padding:25,borderRadius:24,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",backdropFilter:"blur(20px)",color:"white",opacity:interpolate(frame,[4.8*fps,5.5*fps],[0,1],{...clamp}),translate:interpolate(frame,[4.8*fps,5.7*fps],["-35px 0px","0px 0px"],{...clamp})}}><small style={{color:"#BCC5FF",fontWeight:900}}>LIVE SCORE</small><div style={{fontSize:48,fontWeight:900,letterSpacing:"-.04em",marginTop:8}}>{score.toLocaleString()}</div><span style={{color:COLORS.mint,fontWeight:900}}>+250 reward points</span></div>
        <div style={{position:"absolute",right:120,top:430,width:330,padding:27,borderRadius:24,background:opened?"linear-gradient(145deg,#FFF3D8,#FFD786)":"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.22)",color:opened?COLORS.navy:"white",boxShadow:opened?"0 25px 80px rgba(255,198,101,.28)":"none",scale:opened?spring({frame:frame-6.2*fps,fps,config:{damping:12,stiffness:120}}):.86,opacity:interpolate(frame,[5.8*fps,6.3*fps],[0,1],{...clamp})}}><small style={{fontWeight:900,letterSpacing:".12em"}}>RARE REWARD</small><div style={{fontSize:40,fontWeight:900,margin:"10px 0"}}>HACK UNLOCKED</div><p style={{fontSize:15,lineHeight:1.5,margin:0}}>A special chance to take 15% of another player's current points.</p></div>
        {Array.from({length:20}).map((_,i)=><span key={i} style={{position:"absolute",left:`${48+(i%5)*4}%`,top:`${48+Math.floor(i/5)*6}%`,width:8,height:8,borderRadius:99,background:i%2?COLORS.amber:COLORS.cyan,opacity:opened?interpolate(frame,[6.2*fps,(6.6+(i%4)*.08)*fps],[0,.8],{...clamp}):0,translate:opened?`${(i%5-2)*55}px ${(Math.floor(i/5)-2)*40}px`:"0px 0px"}} />)}
      </AbsoluteFill>
    </SceneShell>
  );
};
