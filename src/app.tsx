import { createRoot } from "react-dom/client";
import { DemoPage } from "./components/demo";

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
document.body.style.margin = "0";
document.body.style.height = "100vh";

const root = createRoot(document.body);
root.render(<DemoPage />);
