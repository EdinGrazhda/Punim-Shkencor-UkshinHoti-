import {Composition, Folder} from "remotion";
import {Promo} from "./Promo";
import {HookScene} from "./scenes/HookScene";
import {PlatformScene} from "./scenes/PlatformScene";
import {TeacherScene} from "./scenes/TeacherScene";
import {StudentScene} from "./scenes/StudentScene";
import {RewardsScene} from "./scenes/RewardsScene";
import {SchoolsScene} from "./scenes/SchoolsScene";
import {EndingScene} from "./scenes/EndingScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CkaDinTiPromo"
        component={Promo}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          launchLine: "COMING SOON",
          includeAudio: true,
        }}
      />
      <Folder name="Scenes">
        <Composition id="HookScene" component={HookScene} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="PlatformScene" component={PlatformScene} durationInFrames={360} fps={30} width={1920} height={1080} />
        <Composition id="TeacherScene" component={TeacherScene} durationInFrames={480} fps={30} width={1920} height={1080} />
        <Composition id="StudentScene" component={StudentScene} durationInFrames={510} fps={30} width={1920} height={1080} />
        <Composition id="RewardsScene" component={RewardsScene} durationInFrames={360} fps={30} width={1920} height={1080} />
        <Composition id="SchoolsScene" component={SchoolsScene} durationInFrames={330} fps={30} width={1920} height={1080} />
        <Composition id="EndingScene" component={EndingScene} durationInFrames={360} fps={30} width={1920} height={1080} defaultProps={{launchLine: "COMING SOON"}} />
      </Folder>
    </>
  );
};
