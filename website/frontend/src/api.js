// Central API configuration.
//
// Two backends:
//   API_BASE -> Node/Express gateway (auth + patient records)        :5005
//   ML_BASE  -> Python Flask service (prediction, grad-cam, chat...)  :5001
//
// Both can be overridden at build time with Vite env vars
// (VITE_API_BASE / VITE_ML_BASE), e.g. for deployment.
export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5005";
export const ML_BASE = import.meta.env.VITE_ML_BASE || "http://localhost:5001";

export const authHeader = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
