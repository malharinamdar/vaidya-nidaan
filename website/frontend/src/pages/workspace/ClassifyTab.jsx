import { ClassBars, Analysing, VerdictCard } from "../../components/results";
import { ml } from "../../lib/api";
import { ErrorBox, NeedScan, RunButton, TabHeader, isVolume, useRun } from "./common";

export default function ClassifyTab({ scan, setResult }) {
  const { result, loading, error, run } = useRun(scan, setResult, "classify", async (file) => (await ml("/prediction", { file })).prediction);
  const volume = isVolume(scan);
  return (
    <div>
      <TabHeader
        title="Classification"
        description="VGG-19 transfer-learning classifier trained on OASIS-1, scoring the slice as Demented or Non-demented."
        action={scan && !volume && <RunButton onClick={run} loading={loading} hasResult={!!result} label="Classify scan" />}
      />
      <ErrorBox error={error} onRetry={run} />
      {!scan || volume ? (
        <NeedScan volumeNotSupported={volume} />
      ) : loading ? (
        <Analysing image={scan.url} steps={["Validating the image looks like an MRI", "Resizing to 128 × 128", "Running VGG-19 + dense head"]} />
      ) : result ? (
        <div className="space-y-6">
          <VerdictCard label={result.prediction} probability={result.alzheimer_probability} size="lg" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-ink-200 p-5">
              <p className="label-eyebrow mb-4">Class probabilities</p>
              <ClassBars perClass={result.per_class} />
            </div>
            <div className="rounded-2xl border border-ink-200 p-5">
              <p className="label-eyebrow mb-4">Model</p>
              <dl className="grid grid-cols-2 gap-4 text-[13px]">
                {[
                  ["Backbone", "VGG-19 (ImageNet)"],
                  ["Head", "256 → 128 → softmax"],
                  ["Input", "128 × 128 axial slice"],
                  ["Threshold", "P(Demented) ≥ 50%"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="mt-0.5 font-medium text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[12.5px] text-ink-500">See the Grad-CAM++ tab for the regions behind this score.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-ink-50/60 p-8 sm:flex-row">
          <img src={scan.url} alt="" className="h-32 w-32 rounded-xl bg-black object-contain" />
          <div>
            <p className="text-[15px] font-semibold text-ink-900">Ready to classify {scan.name}</p>
            <p className="mt-1 text-[13px] text-ink-500">Takes a couple of seconds on the server.</p>
            <div className="mt-4">
              <RunButton onClick={run} loading={loading} label="Classify scan" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
