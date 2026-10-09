import React from "react";
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {FONT, clamp} from "../theme";

export const SceneShell: React.FC<{children: React.ReactNode; fade?: boolean; style?: React.CSSProperties}> = ({children, fade = true, style}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{fontFamily: FONT, overflow: "hidden", opacity: fade ? interpolate(frame, [0, 0.35 * fps, durationInFrames - 0.35 * fps, durationInFrames - 1], [0, 1, 1, 0], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}) : 1, ...style}}>{children}</AbsoluteFill>
  );
};
