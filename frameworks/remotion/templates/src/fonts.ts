// fonts.ts — load display/body/mono via @remotion/google-fonts (blocks render until ready).
import { loadFont as loadEBGaramond } from "@remotion/google-fonts/EBGaramond";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

const eb = loadEBGaramond("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "500"], subsets: ["latin"] });
const mono = loadJetBrainsMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const FONT_DISPLAY = eb.fontFamily;
export const FONT_BODY = inter.fontFamily;
export const FONT_MONO = mono.fontFamily;
