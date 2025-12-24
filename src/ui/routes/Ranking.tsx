import { useEffect, useState } from "react";
import { getProducts } from "../../api/repo";

export default function Ranking() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    getProducts().then(setProducts).catch(console.error);
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Ranking</h1>
      <pre>{JSON.stringify(products, null, 2)}</pre>
    </main>
  );
}
