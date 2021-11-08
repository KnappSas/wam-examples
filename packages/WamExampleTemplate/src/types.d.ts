import { WamSDK } from "../../sdk";
import getWamExampleTemplateSynth from "./WamExampleTemplateSynth";
import getWamExampleTemplateEffect from "./WamExampleTemplateEffect";

export interface WebAudioControlsWidget extends HTMLElement { value: number; }
export const WamExampleTemplateEffect: ReturnType<typeof getWamExampleTemplateEffect>;
export interface WamExampleTemplateEffect extends InstanceType<ReturnType<typeof getWamExampleTemplateEffect>> {}
export const WamExampleTemplateSynth: ReturnType<typeof getWamExampleTemplateSynth>;
export interface WamExampleTemplateSynth extends InstanceType<ReturnType<typeof getWamExampleTemplateSynth>> {}

export interface WamExampleTemplateDependencies extends WamSDK {
    WamExampleTemplateSynth: typeof WamExampleTemplateSynth;
    WamExampleTemplateEffect: typeof WamExampleTemplateEffect;
    WebAudioControlsWidget: WebAudioControlsWidget;
}
