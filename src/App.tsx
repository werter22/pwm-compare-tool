import { Routes, Route } from "react-router-dom";
import Ranking from "./ui/routes/Ranking";
import Wizard from "./ui/routes/Wizard";
import Product from "./ui/routes/Product";
import Compare from "./ui/routes/Compare";
import Home from "./ui/routes/Home";
import TopNav from "./ui/layout/TopNav";

export default function App() {
  return (
    <>
      <TopNav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/wizard" element={<Wizard />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/compare" element={<Compare />} />
      </Routes>
    </>
  );
}
