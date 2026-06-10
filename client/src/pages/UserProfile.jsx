import { useEffect, useMemo, useState } from "react";
import styles from "./UserProfile.module.css";

function toTitle(product) {
  return String(product || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function readJsonSafe(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function UserProfile({ user }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL;
  const productCardsBase = import.meta.env.VITE_PRODUCT_CARDS_DOMAIN;

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [items, setItems] = useState([]); // array of { email, productId, createdAt }

  const email = user?.email;

  useEffect(() => {
    async function load() {
      setError("");

      if (!email) {
        setStatus("not-logged-in");
        return;
      }

      if (!API_BASE) {
        setStatus("error");
        setError("Missing VITE_API_BASE_URL");
        return;
      }

      try {
        setStatus("loading");

        const res = await fetch(
          `${API_BASE}/favourites?email=${encodeURIComponent(email)}`
        );

        const data = await readJsonSafe(res);

        if (!res.ok) {
          throw new Error(data?.message || `Failed to load favourites (${res.status})`);
        }

        setItems(Array.isArray(data?.favourites) ? data.favourites : []);
        setStatus("ready");
      } catch (err) {
        setStatus("error");
        setError(err?.message || "Failed to load favourites");
      }
    }

    load();
  }, [email, API_BASE]);

  // It takes the favourites returned from the database, extracts just the product names from each item (each item is an object), removes any empty values, and recalculates that list only when the favourites data changes. 
  const productIds = useMemo(
    () => items.map((x) => x.productId).filter(Boolean),
    [items]
  );

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Your profile</h1>

      {status === "not-logged-in" && (
        <p className={styles.info}>Please log in to view your favourites.</p>
      )}

      {status === "loading" && <p className={styles.info}>Loading favourites…</p>}

      {status === "error" && (
        <p className={styles.error}>{error || "Something went wrong"}</p>
      )}

      {status === "ready" && (
        <>
          <p className={styles.sub}>
            Signed in as <strong>{email}</strong>
          </p>
          <p className={styles.sub}>
            Here are your favourite products!
          </p>

          {productIds.length === 0 ? (
            <p className={styles.info}>No favourites yet. Go like a product first.</p>
          ) : (
            <div className={styles.grid}>
              {productIds.map((id) => {
                const pdfUrl = `${productCardsBase}/${id}.pdf`;

                return (
                  <div key={id} className={styles.card}>
                    <div className={styles.name}>{toTitle(id)}</div>

                    <a
                      className={styles.link}
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View PDF
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
