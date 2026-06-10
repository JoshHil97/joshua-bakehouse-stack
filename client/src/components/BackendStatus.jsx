import { useEffect, useState } from "react";
import styles from "./BackendStatus.module.css";

export default function BackendStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    async function check() {
        try {
          const response = await fetch("/api/healthcheck", { method: "GET" });
      
          // Must return JSON (our API will do this later)
          const contentType = response.headers.get("content-type");
      
          if (!response.ok || !contentType?.includes("application/json")) {
            throw new Error("Not a real API response");
          }
      
          setStatus("online");
        } catch {
          setStatus("offline");
        }
      }

    check();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.title}>Backend Health Check</div>

      {status === "checking" && (
        <div className={styles.checking}>Checking backend...</div>
      )}

      {status === "online" && (
        <div className={styles.online}>API is online</div>
      )}

      {status === "offline" && (
        <div className={styles.offline}>
          API is offline!!!
          <div className={styles.subtext}>
            Check that the API is deployed or that your local proxy is running.
          </div>
        </div>
      )}
    </div>
  );
}
