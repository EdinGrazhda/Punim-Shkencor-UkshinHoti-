import React from "react";
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, clamp} from "../theme";

export const Kicker: React.FC<{children: React.ReactNode; light?: boolean}> = ({children, light = false}) => (
  <div style={{fontSize: 18, lineHeight: 1, fontWeight: 900, letterSpacing: "0.16em", color: light ? "rgba(255,255,255,.68)" : COLORS.periwinkle}}>{children}</div>
);

export const RevealText: React.FC<{children: React.ReactNode; delay?: number; size?: number; align?: "left" | "center" | "right"; maxWidth?: number}> = ({children, delay = 0, size = 96, align = "left", maxWidth = 1400}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{maxWidth, textAlign: align, color: COLORS.white, fontSize: size, lineHeight: 0.98, fontWeight: 900, letterSpacing: "-0.055em", opacity: interpolate(frame, [delay * fps, (delay + 0.55) * fps], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}), translate: interpolate(frame, [delay * fps, (delay + 0.75) * fps], ["0px 62px", "0px 0px"], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)})}}>{children}</div>
  );
};

export const Pill: React.FC<{children: React.ReactNode; tone?: "violet" | "mint" | "amber"}> = ({children, tone = "violet"}) => (
  <span style={{display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 99, backgroundColor: tone === "mint" ? "#E0F8EF" : tone === "amber" ? "#FFF2D5" : "#E9EBFF", color: tone === "mint" ? "#147354" : tone === "amber" ? "#8C5B00" : "#3548B8", fontSize: 15, fontWeight: 900, letterSpacing: "0.05em"}}>{children}</span>
);
