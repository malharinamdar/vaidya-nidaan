import { cx } from "./ui";

// Plain statement of what the system is and isn't. Shown on the landing page and in-app.
export const MODEL_FACTS = [
  ["Task", "Binary classification of an axial T1-weighted MRI slice: Demented vs Non-demented."],
  ["Training data", "OASIS-1 cross-sectional study: 86,437 axial slices from 347 subjects (81 demented, CDR ≥ 0.5; 266 non-demented), split by patient into train / validation / test (243 / 52 / 52)."],
  ["Classifier", "VGG-19 pretrained on ImageNet, last block fine-tuned, with a dense head (256 → 128 → softmax) on 128 × 128 inputs and a class-weighted loss."],
  ["Decision threshold", "Demented when P(Demented) ≥ 13%, the cut-off that best balanced sensitivity and specificity on the validation patients."],
  ["Test results", "52 held-out patients. Per slice: sensitivity 89%, specificity 67%, ROC-AUC 0.85. Per patient (slices averaged): ROC-AUC 0.89 (95% CI 0.79–0.97)."],
  ["Explainability", "Grad-CAM++ on the last convolutional layer (block5_conv4), computed on the class log-odds."],
  ["Tissue biomarkers", "FSL BET brain extraction + FAST 3-class segmentation (CSF, grey matter, white matter), partial-volume weighted."],
  ["Clinical rationale", "GPT-4o, grounded in PubMed/MEDLINE abstracts retrieved from a 513-paper Chroma index and cited inline."],
];

export const INTENDED_USE = "Research and education. Not a medical device.";

export default function ModelCard({ dark = false }) {
  return (
    <div>
      <dl className={cx("divide-y", dark ? "divide-white/10" : "divide-ink-100")}>
        {MODEL_FACTS.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
            <dt className={cx("font-mono text-[11px] tracking-[0.12em] uppercase sm:pt-0.5", dark ? "text-brand-300" : "text-ink-500")}>{k}</dt>
            <dd className={cx("text-[14px] leading-relaxed sm:col-span-2", dark ? "text-white/80" : "text-ink-700")}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className={cx("mt-4 text-[12.5px]", dark ? "text-white/50" : "text-ink-500")}>Intended use: {INTENDED_USE}</p>
    </div>
  );
}
