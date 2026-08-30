import { StudyApp } from "./study/StudyApp";
import { WorkspaceApp } from "./workspace/WorkspaceApp";
import { runtimeConfig } from "./runtime";

export default function App() {
  const isStudyRoute = window.location.pathname.replace(/\/$/, "").endsWith("/study");
  return (
    <>
      {isStudyRoute ? <StudyApp /> : <WorkspaceApp />}
      {runtimeConfig.demoMode && (
        <span className="demo-mode-indicator" role="img" aria-label="Demo mode" />
      )}
    </>
  );
}
