export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

export const shortId = (id = "") => `VN-${String(id).slice(-6).toUpperCase()}`;

export function formatDate(value, opts = {}) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", ...opts });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(value) {
  if (!value) return "";
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(value);
}

export const formatBytes = (n = 0) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const isDemented = (label) => label && label !== "Non Demented";

// Plain-language label for how far the score sits from the decision threshold, as a share of
// the room on that side of it (so a 13% threshold is treated the same way as a 50% one).
export function signalStrength(pDemented, threshold = 50) {
  const room = pDemented >= threshold ? 100 - threshold : threshold;
  const margin = room > 0 ? Math.abs(pDemented - threshold) / room : 1;
  if (margin >= 0.8) return "High";
  if (margin >= 0.4) return "Moderate";
  return "Low";
}

export const TISSUE = {
  csf_fraction_pct: { label: "CSF", long: "Cerebrospinal fluid", color: "#60a5fa" },
  grey_matter_fraction_pct: { label: "Grey matter", long: "Grey matter", color: "#18a886" },
  white_matter_fraction_pct: { label: "White matter", long: "White matter", color: "#c7cfe4" },
};

export const BIOMARKER_LABELS = {
  csf_fraction_pct: ["CSF fraction", "%"],
  grey_matter_fraction_pct: ["Grey-matter fraction", "%"],
  white_matter_fraction_pct: ["White-matter fraction", "%"],
  gm_wm_ratio: ["GM : WM ratio", ""],
  brain_parenchymal_fraction_pct: ["Brain parenchymal fraction", "%"],
  brain_volume_mm3: ["Brain volume", "mm³"],
  csf_volume_mm3: ["CSF volume", "mm³"],
  grey_matter_volume_mm3: ["Grey-matter volume", "mm³"],
  white_matter_volume_mm3: ["White-matter volume", "mm³"],
  mean_intensity: ["Mean intensity", ""],
  median_intensity: ["Median intensity", ""],
  std_intensity: ["Intensity SD", ""],
  min_intensity: ["Min intensity", ""],
  max_intensity: ["Max intensity", ""],
  brain_extraction: ["Brain extraction", ""],
  dark_tissue_fraction_pct: ["Dark-pixel fraction", "%"],
};
