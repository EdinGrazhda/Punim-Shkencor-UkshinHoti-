import React from "react";
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {BrowserFrame} from "../components/BrowserFrame";
import {TeacherUi, StudentQuestionUi} from "../components/ProductUi";
import {Kicker} from "../components/Typography";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

export const SchoolsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <SceneShell style={{backgroundColor:COLORS.mist}}>
      <Ambient light />
      <AbsoluteFill style={{padding:"86px 105px"}}>
        <div style={{textAlign:"center"}}><Kicker>BUILT FOR MODERN SCHOOLS</Kicker><h1 style={{margin:"13px auto 0",color:COLORS.navy,fontSize:70,lineHeight:1.05,letterSpacing:"-.055em"}}>A complete learning experience.<br /><span style={{color:COLORS.periwinkle}}>Not just another game.</span></h1></div>
        <BrowserFrame compact style={{position:"absolute",width:1070,height:590,left:95,top:335,rotate:"-2deg",translate:interpolate(frame,[0,11*fps],["0px 30px","30px -20px"],{...clamp})}}><TeacherUi /></BrowserFrame>
        <BrowserFrame compact style={{position:"absolute",width:720,height:500,right:75,top:390,rotate:"3deg",translate:interpolate(frame,[0,11*fps],["0px -10px","-35px 20px"],{...clamp})}}><StudentQuestionUi variant={frame>6.5*fps?"results":"question"}/></BrowserFrame>
        <div style={{position:"absolute",left:105,right:105,bottom:50,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:18}}>{[["SMARTER TOOLS","FOR TEACHERS"],["MORE ENGAGEMENT","FOR STUDENTS"],["NEW POSSIBILITIES","FOR SCHOOLS"]].map(([a,b],i)=><div key={a} style={{padding:"17px 22px",borderRadius:15,background:i===2?COLORS.navy:"white",color:i===2?"white":COLORS.navy,border:"1px solid #E2E6F0",boxShadow:"0 14px 35px rgba(25,39,94,.1)",opacity:interpolate(frame,[(2+i*.35)*fps,(2.6+i*.35)*fps],[0,1],{...clamp})}}><small style={{color:i===2?COLORS.cyan:COLORS.periwinkle,fontWeight:900,letterSpacing:".1em"}}>{a}</small><div style={{fontSize:24,fontWeight:900,marginTop:3}}>{b}</div></div>)}</div>
      </AbsoluteFill>
    </SceneShell>
  );
};
