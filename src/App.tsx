import { StudyApp } from "./study/StudyApp";
import { WorkspaceApp } from "./workspace/WorkspaceApp";

export default function App() {
  return window.location.pathname.startsWith("/study") ? <StudyApp /> : <WorkspaceApp />;
}
