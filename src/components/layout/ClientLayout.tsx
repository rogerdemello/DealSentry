import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  FileText, 
  Shield, 
  Link2, 
  ClipboardList, 
  LogOut,
  ChevronRight,
  Sparkles,
  User,
  Crown,
  Home as HomeIcon,
  Settings as SettingsIcon
} from "lucide-react";
import { isAuthenticated, getCurrentUser, clearAuthData } from "@/lib/auth-utils";

interface ClientLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/compliance", label: "Compliance", icon: Shield },
  { href: "/integrations", label: "Integrations", icon: Link2 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/audit", label: "Audit", icon: ClipboardList, adminOnly: true },
];

export default function ClientLayout({ children }: ClientLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    const loggedIn = isAuthenticated();
    const currentUser = getCurrentUser();

    setIsLoggedIn(loggedIn);
    setUserRole(currentUser?.role || "");
    setUserName(currentUser?.name || currentUser?.email || "User");

    // Allow access to home page and auth pages without authentication
    const publicPaths = ["/", "/login", "/auth", "/signup"];
    if (!loggedIn && !publicPaths.includes(location.pathname)) {
      navigate("/auth");
    }
  }, [location.pathname, navigate]);

  const handleLogout = () => {
    clearAuthData();
    navigate("/auth");
  };

  // Don't show sidebar on auth pages or home page
  const authPaths = ["/login", "/auth", "/signup"];
  if (authPaths.includes(location.pathname) || location.pathname === "/") {
    return <>{children}</>;
  }

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || userRole === "ADMIN"
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/[0.02] via-transparent to-transparent" />
      </div>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="fixed left-0 top-0 z-40 h-screen w-[260px] border-r border-border/60 bg-card/95 backdrop-blur-sm flex flex-col"
      >
        {/* Logo */}
        <div className="flex items-center gap-3.5 px-6 py-5 border-b border-border/60">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading font-semibold text-lg text-foreground tracking-tight">
              Reviewer
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium tracking-wide">Enterprise Suite</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {filteredNavItems.map((item, index) => {
            const isActive = location.pathname === item.href || 
              (item.href !== "/dashboard" && location.pathname.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index, duration: 0.3 }}
              >
                <Link
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[55%] bg-white/30 rounded-r-full"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-[18px] h-[18px] ${isActive ? "" : "group-hover:text-foreground transition-colors"}`} />
                  <span className="font-medium text-[14px]">{item.label}</span>
                  {isActive && (
                    <ChevronRight className="w-4 h-4 ml-auto opacity-70" />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="px-3 py-4 border-t border-border/60">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/40">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              userRole === "ADMIN" 
                ? "bg-primary/15 text-primary" 
                : "bg-muted text-muted-foreground"
            }`}>
              {userRole === "ADMIN" ? (
                <Crown className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[13px] text-foreground truncate">
                {userName}
              </p>
              <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded font-medium ${
                userRole === "ADMIN" 
                  ? "bg-primary/10 text-primary" 
                  : "bg-muted text-muted-foreground"
              }`}>
                {userRole}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 mt-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all duration-200"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span className="font-medium text-[14px]">Sign out</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 ml-[260px] relative">
        {/* Home Button - Top Right Corner */}
        {location.pathname !== "/" && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-2 right-2 z-40"
          >
            <Link
              to="/"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-card/95 backdrop-blur-sm border border-border/60 shadow-sm hover:shadow-md hover:bg-muted/50 transition-all duration-200 text-xs font-medium text-foreground hover:text-primary"
              title="Go to Home"
            >
              <HomeIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </motion.div>
        )}

        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="p-8 pt-12"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}