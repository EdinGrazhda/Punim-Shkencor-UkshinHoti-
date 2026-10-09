import React from "react";
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {Ambient} from "../components/Ambient";
import {Brand} from "../components/Brand";
import {BrowserFrame} from "../components/BrowserFrame";
import {StudentQuestionUi, TeacherUi} from "../components/ProductUi";
import {SceneShell} from "../components/SceneShell";
import {COLORS, clamp} from "../theme";

export const EndingScene: React.FC<{launchLine:string}> = ({launchLine}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const montageOpacity = interpolate(frame,[0,5.8*fps,7*fps],[1,1,0],{...clamp});
  const brandOpacity = interpolate(frame,[6.2*fps,7.2*fps],[0,1],{...clamp});
  return (
    <SceneShell fade={false}>
      <Ambient />
      <AbsoluteFill style={{opacity:montageOpacity}}>
        <BrowserFrame compact style={{position:"absolute",width:850,height:510,left:-80,top:80,rotate:"-5deg",translate:interpolate(frame,[0,6*fps],["0px 0px","-110px -30px"],{...clamp})}}><TeacherUi /></BrowserFrame>
        <BrowserFrame compact style={{position:"absolute",width:850,height:510,right:-70,top:65,rotate:"5deg",translate:interpolate(frame,[0,6*fps],["0px 0px","100px -20px"],{...clamp})}}><StudentQuestionUi variant="question" /></BrowserFrame>
        <BrowserFrame compact style={{position:"absolute",width:920,height:560,left:500,bottom:-100,rotate:"-1deg",scale:interpolate(frame,[0,6*fps],[.9,1.08],{...clamp,output:"perceptual-scale"})}}><StudentQuestionUi variant="reward" /></BrowserFrame>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 45%,rgba(0,0,78,.88))"}} />
        <h2 style={{position:"absolute",left:0,right:0,bottom:90,margin:0,textAlign:"center",color:"white",fontSize:72,letterSpacing:"-.05em"}}>AI. TEACHERS. STUDENTS. <span style={{color:COLORS.cyan}}>ONE EXPERIENCE.</span></h2>
      </AbsoluteFill>
      <AbsoluteFill style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",opacity:brandOpacity,scale:interpolate(frame,[6.2*fps,7.8*fps],[.9,1],{...clamp,output:"perceptual-scale"})}}>
        <div style={{position:"absolute",width:700,height:700,borderRadius:999,background:"radial-gradient(circle,rgba(115,132,232,.36),transparent 65%)"}} />
        <div style={{position:"relative",display:"grid",placeItems:"center",width:150,height:150,borderRadius:42,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.25)",boxShadow:"0 35px 100px rgba(0,0,0,.28)"}}><Img src={staticFile("images/ckadinti-thinking-mascot-v2.png")} style={{width:135,height:135,objectFit:"contain"}} /></div>
        <div style={{position:"relative",marginTop:22}}><Brand dark size={58}/></div>
        <h1 style={{position:"relative",margin:"38px 0 8px",color:"white",fontSize:72,letterSpacing:"-.05em"}}>MAKE LEARNING AN EXPERIENCE.</h1>
        <p style={{position:"relative",margin:0,color:"rgba(255,255,255,.72)",fontSize:27,fontWeight:700}}>Smarter teaching. More exciting learning.</p>
        <div style={{position:"relative",marginTop:42,padding:"13px 24px",borderRadius:99,background:COLORS.cyan,color:COLORS.navy,fontSize:15,fontWeight:900,letterSpacing:".16em"}}>{launchLine}</div>
      </AbsoluteFill>
    </SceneShell>
  );
};
