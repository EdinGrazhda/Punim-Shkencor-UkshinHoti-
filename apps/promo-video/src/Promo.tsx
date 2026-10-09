import React from "react";
import {Audio} from "@remotion/media";
import {Series, staticFile, useVideoConfig} from "remotion";
import {HookScene} from "./scenes/HookScene";
import {PlatformScene} from "./scenes/PlatformScene";
import {TeacherScene} from "./scenes/TeacherScene";
import {StudentScene} from "./scenes/StudentScene";
import {RewardsScene} from "./scenes/RewardsScene";
import {SchoolsScene} from "./scenes/SchoolsScene";
import {EndingScene} from "./scenes/EndingScene";

export type PromoProps = {
  readonly launchLine: string;
  readonly includeAudio: boolean;
};

export const Promo: React.FC<PromoProps> = ({launchLine, includeAudio}) => {
  const {fps} = useVideoConfig();
  return (
    <>
      <Series>
        <Series.Sequence name="01 Hook" durationInFrames={10 * fps} premountFor={fps}><HookScene /></Series.Sequence>
        <Series.Sequence name="02 Platform" durationInFrames={12 * fps} premountFor={fps}><PlatformScene /></Series.Sequence>
        <Series.Sequence name="03 AI for teachers" durationInFrames={16 * fps} premountFor={fps}><TeacherScene /></Series.Sequence>
        <Series.Sequence name="04 Student experience" durationInFrames={17 * fps} premountFor={fps}><StudentScene /></Series.Sequence>
        <Series.Sequence name="05 Rewards" durationInFrames={12 * fps} premountFor={fps}><RewardsScene /></Series.Sequence>
        <Series.Sequence name="06 Modern schools" durationInFrames={11 * fps} premountFor={fps}><SchoolsScene /></Series.Sequence>
        <Series.Sequence name="07 Ending" durationInFrames={12 * fps} premountFor={fps}><EndingScene launchLine={launchLine} /></Series.Sequence>
      </Series>
      {includeAudio && <>
        <Audio name="Original soundtrack" src={staticFile("audio/music.wav")} volume={0.24} premountFor={fps} />
        <Audio name="Voice-over" src={staticFile("audio/voiceover.wav")} volume={1} premountFor={fps} />
        <Audio name="Reveal whoosh" src={staticFile("audio/whoosh.wav")} from={Math.round(3.25 * fps)} volume={0.42} premountFor={fps} />
        <Audio name="Generate click" src={staticFile("audio/click.wav")} from={Math.round(25.2 * fps)} volume={0.4} premountFor={fps} />
        <Audio name="Reward chime" src={staticFile("audio/ding.wav")} from={Math.round(61.2 * fps)} volume={0.52} premountFor={fps} />
      </>}
    </>
  );
};
