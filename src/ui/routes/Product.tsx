import { useParams } from "react-router-dom";

export default function Product() {
  const { id } = useParams();
  return (
    <main style={{ padding: 24 }}>
      <h1>Produktdetail</h1>
      <p>Produkt-ID: {id}</p>
    </main>
  );
}
