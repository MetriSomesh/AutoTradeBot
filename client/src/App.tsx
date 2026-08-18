import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AccountSettings from "./pages/AccountSettings";
import Home from "./pages/Home";
import ManualAdoption from "./pages/ManualAdoption";
import NotFound from "./pages/NotFound";
import OperationalStatus from "./pages/OperationalStatus";
import PnlAnalytics from "./pages/PnlAnalytics";
import RiskSettings from "./pages/RiskSettings";
import ScheduledEntries from "./pages/ScheduledEntries";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import TradeHistory from "./pages/TradeHistory";

function DashboardRoutes() {
  return <DashboardLayout><Switch><Route path="/" component={Home} /><Route path="/adoption" component={ManualAdoption} /><Route path="/history" component={TradeHistory} /><Route path="/analytics" component={PnlAnalytics} /><Route path="/risk" component={RiskSettings} /><Route path="/scheduled-entries" component={ScheduledEntries} /><Route path="/status" component={OperationalStatus} /><Route path="/account" component={AccountSettings} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></DashboardLayout>;
}

function Router() {
  return <Switch><Route path="/signin" component={SignIn} /><Route path="/signup" component={SignUp} /><Route component={DashboardRoutes} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
