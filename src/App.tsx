import { Routes, Route, Navigate } from "react-router-dom";
import Ranking from "./ui/routes/Ranking";
import Wizard from "./ui/routes/Wizard";
import Product from "./ui/routes/Product";
import Compare from "./ui/routes/Compare";
import Lite from "./ui/routes/Lite";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/ranking" replace />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/wizard" element={<Wizard />} />
      <Route path="/product/:id" element={<Product />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/lite" element={<Lite />} />
    </Routes>
  );
}
