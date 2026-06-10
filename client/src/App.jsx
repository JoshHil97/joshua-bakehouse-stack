import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";
import Layout from "./layout/Layout";

import Home from "./pages/Home";
import Products from "./pages/Products";
import NewProduct from "./pages/NewProduct";
import Customers from "./pages/Customers";
import NewCustomer from "./pages/NewCustomer";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import Login from "./pages/Login";
import Signup from "./pages/SignUp";

import UserProfile from "./pages/UserProfile";
import RequireAuth from "./auth/RequireAuth";

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("bakehouseUser");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // If one doesnt exist then remove any trace to one (just in case)
      localStorage.removeItem("bakehouseUser");
    }

    return null;
  });

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} setUser={setUser} />}>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products user={user} />} />
          <Route path="/products/new" element={<NewProduct />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<NewCustomer />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<NewOrder />} />
          {/* This route here is first going to render our RequireAuth component which will return if no user is logged in and render children ( UserProfile ) if  user is logged in */}
          <Route path="/userProfile"element={<RequireAuth user={user}> <UserProfile user={user} /> </RequireAuth>}/>
          <Route path="/login" element={<Login setUser={setUser} />} />
          <Route path="/signup" element={<Signup setUser={setUser} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
