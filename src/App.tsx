import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import CreateLabel from "./pages/Forms/CreateLabel";
import AccountsStore from "./pages/Marketplace/AccountsStore";
import RequireAuth from "./components/auth/RequireAuth";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index path="/" element={<Home />} />
            <Route path="/create-label" element={<CreateLabel />} />
            <Route path="/store" element={<AccountsStore />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route
            path="/signin"
            element={
              localStorage.getItem("auth.token") ? (
                <Navigate to="/" replace />
              ) : (
                <SignIn />
              )
            }
          />
          <Route
            path="/signup"
            element={
              localStorage.getItem("auth.token") ? (
                <Navigate to="/" replace />
              ) : (
                <SignUp />
              )
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
