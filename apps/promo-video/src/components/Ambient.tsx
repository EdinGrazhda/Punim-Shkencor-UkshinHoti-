import React from "react";
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, clamp} from "../theme";

export const Ambient: React.FC<{light?: boolean}> = ({light = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{overflow: "hidden", backgroundColor: light ? COLORS.mist : COLORS.navy}}>
      <div style={{position: "absolute", width: 760, height: 760, borderRadius: 999, left: -180, top: -280, background: light ? "#CFD7FF" : "#4557D8", filter: "blur(110px)", opacity: 0.35, translate: interpolate(frame, [0, 8 * fps], ["0px 0px", "130px 80px"], {...clamp})}} />
      <div style={{position: "absolute", width: 650, height: 650, borderRadius: 999, right: -130, bottom: -290, background: light ? "#BDF2E1" : "#5D29A8", filter: "blur(120px)", opacity: 0.28, translate: interpolate(frame, [0, 9 * fps], ["0px 0px", "-110px -70px"], {...clamp})}} />
      {Array.from({length: 18}).map((_, index) => (
        <div key={index} style={{position: "absolute", width: index % 4 === 0 ? 6 : 3, height: index % 4 === 0 ? 6 : 3, borderRadius: 99, left: `${6 + ((index * 17) % 88)}%`, top: `${10 + ((index * 29) % 78)}%`, background: light ? COLORS.periwinkle : COLORS.white, opacity: 0.12 + (index % 3) * 0.06, translate: `0px ${Math.sin((frame + index * 17) / (1.7 * fps)) * 18}px`}} />
      ))}
    </AbsoluteFill>
  );
};
