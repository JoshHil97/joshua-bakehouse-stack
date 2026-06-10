import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Signup.module.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function readJsonSafe(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function Signup({ setUser }) {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");

    if (!API_BASE) {
      setError("Missing VITE_API_BASE_URL in env file");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        throw new Error(data?.message || `Sign up failed (${res.status})`);
      }

      const newUser = data?.user;

      localStorage.setItem("bakehouseUser", JSON.stringify(newUser));
      setUser(newUser);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Sign up failed");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign up</h1>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSignup} className={styles.form}>
          <input
            className={styles.input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
          />

          <input
            className={styles.input}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            autoComplete="new-password"
          />

          <button className={styles.button} type="submit">
            Create account and log in
          </button>
        </form>
      </div>
    </div>
  );
}
