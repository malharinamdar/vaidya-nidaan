import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { warmUpML } from "./lib/api";
import { ScanProvider } from "./lib/scan";
import { Spinner, ToastProvider } from "./components/ui";
import PrivateRoute from "./components/PrivateRoute";
import AppShell from "./components/AppShell";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";

// The workspace (charts, markdown, chat) loads on demand, keeping the landing page light.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewPatient = lazy(() => import("./pages/NewPatient"));
const PatientWorkspace = lazy(() => import("./pages/PatientWorkspace"));
const ReportView = lazy(() => import("./pages/ReportView"));
const Assistant = lazy(() => import("./pages/Assistant"));

const Loading = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Spinner className="h-6 w-6" />
  </div>
);

// Old URLs (v1 had one page per tool) -> the matching workspace tab.
function Legacy({ tab }) {
  const { id } = useParams();
  return <Navigate to={`/patients/${id}${tab ? `/${tab}` : ""}`} replace />;
}

export default function App() {
  useEffect(() => {
    warmUpML();
  }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ScanProvider>
            <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              <Route element={<PrivateRoute><AppShell /></PrivateRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/patients/new" element={<NewPatient />} />
                <Route path="/patients/:id" element={<PatientWorkspace />} />
                <Route path="/patients/:id/:tab" element={<PatientWorkspace />} />
                <Route path="/assistant" element={<Assistant />} />
              </Route>
              {/* The report is a standalone printable document (no app chrome). */}
              <Route path="/reports/:reportId" element={<PrivateRoute><ReportView /></PrivateRoute>} />

              <Route path="/create-patient" element={<Navigate to="/patients/new" replace />} />
              <Route path="/patient/:id" element={<Legacy />} />
              <Route path="/profile/:id" element={<Legacy />} />
              <Route path="/alzheimers-detection/:id" element={<Legacy tab="classify" />} />
              <Route path="/grad-cam/:id" element={<Legacy tab="gradcam" />} />
              <Route path="/biomarker-analysis/:id" element={<Legacy tab="biomarkers" />} />
              <Route path="/diagnosis-report/:id" element={<Legacy tab="report" />} />
              <Route path="/chat-with-ai/:id" element={<Legacy tab="assistant" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </ScanProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
