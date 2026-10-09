import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {BrowserFrame} from "../components/BrowserFrame";
import {StudentQuestionUi} from "../components/ProductUi";
import {Kicker} from "../components/Typography";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

const MiniJoin: React.FC<{name:string; code:string}> = ({name,code}) => <div style={{height:"100%",padding:24,background:"linear-gradient(155deg,#F7F8FE,#E9EDFF)",color:COLORS.navy}}><div style={{display:"flex",justifyContent:"space-between",fontWeight:900}}><span>CkaDinTi<span style={{color:COLORS.violet}}>.</span></span><small style={{color:COLORS.green}}>● CONNECTED</small></div><div style={{marginTop:48,padding:24,borderRadius:18,background:"white",textAlign:"center",boxShadow:"0 18px 45px rgba(32,44,100,.1)"}}><div style={{width:55,height:55,margin:"0 auto 12px",display:"grid",placeItems:"center",borderRadius:16,background:"#E8ECFF",fontSize:27}}>✦</div><small style={{color:COLORS.periwinkle,fontWeight:900}}>WELCOME, {name.toUpperCase()}</small><h2 style={{fontSize:27,margin:"10px 0"}}>Join the mission</h2><p style={{color:"#7C88A1",fontSize:12}}>Enter your teacher's classroom code.</p><div style={{marginTop:20,padding:14,border:"2px solid #CBD3F4",borderRadius:10,fontSize:25,fontWeight:900,letterSpacing:".18em"}}>{code}</div><div style={{marginTop:12,padding:13,borderRadius:10,background:COLORS.navy,color:"white",fontWeight:900}}>Join Game →</div></div></div>;

export const StudentScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phase = frame < 4.5*fps ? "join" : frame < 10*fps ? "question" : frame < 13.5*fps ? "answer" : "results";
  return (
    <SceneShell>
      <Ambient />
      <AbsoluteFill style={{padding:"82px 98px"}}>
        <div style={{display:"flex",alignItems:"end",justifyContent:"space-between"}}><div><Kicker light>THE STUDENT EXPERIENCE</Kicker><h1 style={{margin:"13px 0 0",color:"white",fontSize:80,lineHeight:1,letterSpacing:"-.055em"}}>LEARN. COMPETE. <span style={{color:COLORS.cyan}}>IMPROVE.</span></h1></div><p style={{maxWidth:480,margin:0,color:"rgba(255,255,255,.7)",fontSize:20,lineHeight:1.5}}>One classroom. Many screens. Every student part of the same live challenge.</p></div>
        {phase === "join" ? <div style={{position:"absolute",left:100,right:100,top:260,bottom:70,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:26}}>{[["Maya","K7H3M2"],["Leo","K7H3M2"],["Ava","K7H3M2"]].map(([name,code],i)=><BrowserFrame key={name} compact style={{height:600,translate:`0px ${i===1?-22:18}px`,rotate:`${i===0?-3:i===2?3:0}deg`,opacity:interpolate(frame,[i*.18*fps,(.7+i*.18)*fps],[0,1],{...clamp})}}><MiniJoin name={name!} code={code!}/></BrowserFrame>)}</div> : <>
          <BrowserFrame compact url="play.ckadinti.local" style={{position:"absolute",width:1140,height:690,left:390,top:270,scale:interpolate(frame,[4.5*fps,5.4*fps],[.9,1],{...clamp,easing:Easing.bezier(.16,1,.3,1),output:"perceptual-scale"})}}><StudentQuestionUi variant={phase}/></BrowserFrame>
          <BrowserFrame compact style={{position:"absolute",width:405,height:540,left:75,top:395,rotate:"-5deg",opacity:.92}}><StudentQuestionUi variant={phase==="results"?"results":"question"} name="Leo"/></BrowserFrame>
          <BrowserFrame compact style={{position:"absolute",width:405,height:540,right:55,top:360,rotate:"5deg",opacity:.92}}><StudentQuestionUi variant={phase==="answer"?"answer":phase==="results"?"results":"question"} name="Ava"/></BrowserFrame>
        </>}
        <div style={{position:"absolute",left:100,bottom:45,color:"rgba(255,255,255,.52)",fontSize:13,fontWeight:800,letterSpacing:".08em"}}>AUTHORITATIVE TIMING · PRIVATE ANSWERS · SYNCHRONIZED REVEAL</div>
      </AbsoluteFill>
    </SceneShell>
  );
};
