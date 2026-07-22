// Think of App.tsx as the manager of your application.
// These come from React Router, 
// which lets your app have multiple pages without reloading the browser.
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
// This provides theme information to the whole app
import { ThemeProvider } from "./context/ThemeContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Inbox from "./pages/Inbox";
import ChatWindow from "./pages/ChatWindow";
import ProfileSettings from "./pages/ProfileSettings";
import ChatLayout from "./components/chat/ChatLayout";
import ProtectedRoute from "./components/ProtectedRoute";

// flow:
// App Start=>ThemeProvider=>BrowserRouter=>AuthProvider=>Routes=>Show the correct page

function App() {
  return (
    <ThemeProvider>
      {/* browserrouter help chnages the page based onthe url */}
      <BrowserRouter>
      {/* Everything inside can access authentication. */}
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Full-screen profile/settings page — not part of the sidebar+chat shell */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <ProfileSettings />
                </ProtectedRoute>
              }
            />

            {/* WhatsApp-style shell: sidebar (list) + chat pane render together */}
            <Route
              element={
                <ProtectedRoute>
                  <ChatLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/chat/:userId" element={<ChatWindow />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

