import { Route, Routes } from "react-router-dom";

import { Shell } from "./components/layout/Shell";
import { Toaster } from "./components/ui/sonner";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/*" element={<Shell />} />
      </Routes>
      <Toaster richColors position="top-right" closeButton />
    </>
  );
}
