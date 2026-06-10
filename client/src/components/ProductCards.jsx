import { useEffect, useState } from "react";
import styles from "./ProductCards.module.css";

function toTitle(product) {
  return product
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function readJsonSafe(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function ProductCards({ user }) {
  const baseUrl = import.meta.env.VITE_PRODUCT_CARDS_DOMAIN || "";
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");

  const [favourites, setFavourites] = useState(() => new Set());
  const [saving, setSaving] = useState(() => new Set());

  const email = user?.email;

  // Load products 
  useEffect(() => {
    async function loadProducts() {
      try {
        const response = await fetch(`/api/products`);
        if (!response.ok) throw new Error("API error");
        const data = await response.json();
        setProducts(Array.isArray(data.products) ? data.products : []);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }
    loadProducts();
  }, []);

  // Load favourites for logged in user
  useEffect(() => {
    async function loadFavourites() {
      if (!email || !API_BASE) return;

      try {
        const res = await fetch(
          `${API_BASE}/favourites?email=${encodeURIComponent(email)}`
        );

        const data = await readJsonSafe(res);
        if (!res.ok) return;

        // favourites: [{ email, productId, createdAt }, ...]
        const ids = (data?.favourites || [])
          .map(f => f.productId)
          .filter(Boolean);

        setFavourites(new Set(ids));
      } catch {
        // ignore for now
      }
    }

    loadFavourites();
  }, [email, API_BASE]);

  // Check if this product is already in the favourites set
  // favourites is a Set, so .has() quickly checks if it exists
  const isFav = (productId) => favourites.has(productId);

  const toggleFavourite = async (productId) => {
    if (!email || !API_BASE) return;

    // Add this productId to a "saving" set.
    // This can be used to disable the button while the request is in progress
    // so the user cannot double click it.
    setSaving(prev => new Set(prev).add(productId));

    // Check whether this product was already favourited
    const wasFav = favourites.has(productId);

    // optimistic UI
    // We update the screen immediately before the API responds.
    // This makes the app feel fast. Also to prevent users double lickijng
    setFavourites(prev => {
      // Create a NEW Set based on the previous one
      // (we never mutate React state directly)
      const next = new Set(prev);

      // If it was already favourited, remove it, else add it
      if (wasFav) {
        next.delete(productId);
      }
      else next.add(productId);
      return next;
      // After this point we call the API
      // and if it fails, you would "rollback" the change.
    });

    try {
      const res = await fetch(`${API_BASE}/favourites`, {
        method: wasFav ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productId })
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        // rollback on failure (exact same functionality as before to just reverse the change)
        setFavourites(prev => {
          const next = new Set(prev);
          if (wasFav) next.add(productId);
          else next.delete(productId);
          return next;
        });

        throw new Error(data?.message || "Favourite update failed");
      }
      // If the response is okay, we dont need to update anything, we already did it above 
    } finally {
      setSaving(prev => {
        // Create a NEW Set based on the previous saving state.
        // We never directly modify React state.
        const next = new Set(prev);
        
        // Remove this productId from the saving set,
        // because we have finished attempting to save it.
        // This allows the button to become clickable again.
        next.delete(productId);
        return next;
      });
    }
  };

  if (status === "loading") return <div className={styles.wrap}>Loading products...</div>;
  if (status === "error") return <div className={styles.wrap}>Failed to load products</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        {products.map(productId => {
          const filename = `${productId}.pdf`;
          const liked = isFav(productId);
          const busy = saving.has(productId);

          return (
            <div key={productId} className={styles.card}>
              <div className={styles.name}>{toTitle(productId)}</div>

              <div className={styles.actions}>
                <a
                  className={styles.link}
                  href={`${baseUrl}/${filename}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View PDF
                </a>

                {email && (
                  <button
                    type="button"
                    className={styles.likeBtn}
                    onClick={() => toggleFavourite(productId)}
                    disabled={busy}
                    aria-pressed={liked}
                    title={liked ? "Remove favourite" : "Add favourite"}
                  >
                    {liked ? "Liked" : "Like"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
