import { Analysing, HeatmapViewer } from "../../components/results";
import { ml } from "../../lib/api";
import { ErrorBox, NeedScan, RunButton, TabHeader, isVolume, useRun } from "./common";

export default function GradCamTab({ scan, setResult }) {
  const { result, loading, error, run } = useRun(scan, setResult, "gradcam", (file) => ml("/gradcam", { file }));
  const volume = isVolume(scan);
  return (
    <div>
      <TabHeader
        title="Grad-CAM++"
        description="The regions that drove the model's decision, computed on VGG-19's last convolutional block."
        action={scan && !volume && <RunButton onClick={run} loading={loading} hasResult={!!result} label="Generate heatmap" />}
      />
      <ErrorBox error={error} onRetry={run} />
      {!scan || volume ? (
        <NeedScan volumeNotSupported={volume} />
      ) : loading ? (
        <Analysing image={scan.url} steps={["Forward pass through VGG-19", "Gradients of the log-odds w.r.t. block5_conv4", "Weighting channels (Grad-CAM++) and upsampling"]} />
      ) : result ? (
        <HeatmapViewer
          original={result.mriUrl}
          heatmap={result.heatmapUrl}
          overlay={result.gradCamResult}
          tissuePct={result.tissue_attribution_pct}
          layer={result.layer}
        />
      ) : (
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-ink-50/60 p-8 sm:flex-row">
          <img src={scan.url} alt="" className="h-32 w-32 rounded-xl bg-black object-contain" />
          <div>
            <p className="text-[15px] font-semibold text-ink-900">Explain the model's decision on {scan.name}</p>
            <p className="mt-1 text-[13px] text-ink-500">You'll get an interactive overlay with an opacity slider.</p>
            <div className="mt-4">
              <RunButton onClick={run} loading={loading} label="Generate heatmap" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
