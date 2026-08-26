import { StudyApp } from "./study/StudyApp";
import { WorkspaceApp } from "./workspace/WorkspaceApp";

export default function App() {
  const isStudyRoute = window.location.pathname.replace(/\/$/, "").endsWith("/study");
  return isStudyRoute ? <StudyApp /> : <WorkspaceApp />;
}
