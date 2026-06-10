import { NavLink, Outlet } from "react-router-dom";
import styles from "./Layout.module.css";

// Default Tabs
const tabs = [
  { to: "/", label: "Home", end: true },
  { to: "/products", label: "Products" },
  { to: "/products/new", label: "New Product" },
  { to: "/customers", label: "Customer List" },
  { to: "/customers/new", label: "New Customer" },
  { to: "/orders", label: "Order List" },
  { to: "/orders/new", label: "New Order" }
];

export default function Layout({ user, setUser }) {
  const stackName = import.meta.env.VITE_STACK_NAME ?? "Joshua Hilarion's Bakehouse";

  // Clear the saved user and update the app state.
  const handleLogout = () => {
    localStorage.removeItem("bakehouseUser");
    setUser(null);
  };

  const visibleTabs = user
    ? [...tabs, { to: "/userProfile", label: "Profile" }]
    : tabs;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>{stackName}</div>

        {/* Map over the tabs that should be shown and render a navlink for each */}
        <nav className={styles.nav}>
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                isActive ? `${styles.tab} ${styles.active}` : styles.tab
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.auth}>
          {/* Turnary operator saying if user is logged in the show them confirmation and a logout button */}
          {user ? (
            <>
              <span className={styles.userInfo}>{user.email}</span>
              <button
                type="button"
                className={styles.tab}
                onClick={handleLogout}
              >
                Log out
              </button>
            </>
          ) : (
            // Otherwise show sign-in links.
            <>
              <NavLink to="/login" className={styles.tab}>
                Log in
              </NavLink>
              <NavLink to="/signup" className={styles.tab}>
                Sign up
              </NavLink>
            </>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
