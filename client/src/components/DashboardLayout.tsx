import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { Activity, ChartNoAxesCombined, ClipboardList, KeyRound, LogOut, PanelLeft, ScanSearch, Settings2 } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: ChartNoAxesCombined, label: "Live Monitor", path: "/" },
  { icon: ScanSearch, label: "Manual Adoption", path: "/adoption" },
  { icon: ClipboardList, label: "Trade History", path: "/history" },
  { icon: Settings2, label: "Risk Settings", path: "/risk" },
  { icon: KeyRound, label: "Account & Keys", path: "/account" },
  { icon: Activity, label: "Operational Status", path: "/status" },
];

const SIDEBAR_WIDTH_KEY = "tmt-sidebar-width";
const DEFAULT_WIDTH = 264;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = saved ? Number(saved) : DEFAULT_WIDTH;
    return Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH ? parsed : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#121214] p-5 text-[#e8e8ea]"><div className="w-full max-w-md rounded-2xl border border-[#2a2a30] bg-[#1a1a1e] p-7"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4734E]/35 bg-[#D4734E]/10 font-mono text-sm font-bold text-[#D4734E]">TMT</div><h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">Sign-in required</h1><p className="mt-3 text-sm leading-6 text-[#9a9aa2]">This workspace is protected by a local self-hosted account session.</p><Button onClick={() => { window.location.href = "/signin"; }} size="lg" className="mt-7 w-full bg-[#D4734E] text-[#121214] hover:bg-[#e5835e]">Sign in</Button></div></div>;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => { if (isCollapsed) setIsResizing(false); }, [isCollapsed]);
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => { if (!isResizing) return; const left = sidebarRef.current?.getBoundingClientRect().left ?? 0; const width = event.clientX - left; if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width); };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) { document.addEventListener("mousemove", handleMouseMove); document.addEventListener("mouseup", handleMouseUp); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
  }, [isResizing, setSidebarWidth]);

  return <><div className="relative" ref={sidebarRef}><Sidebar collapsible="icon" className="border-r border-[#2a2a30] bg-[#17171a] text-[#e8e8ea]" disableTransition={isResizing}><SidebarHeader className="h-[72px] justify-center border-b border-[#2a2a30] px-3"><div className="flex w-full items-center gap-3"><button onClick={toggleSidebar} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#9a9aa2] transition-colors hover:bg-[#222226] hover:text-[#e8e8ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4734E]" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed ? <div className="min-w-0"><p className="font-mono text-sm font-bold tracking-[0.18em] text-[#D4734E]">TMT</p><p className="mt-0.5 truncate text-[11px] text-[#9a9aa2]">BTC OPTIONS CONTROL</p></div> : null}</div></SidebarHeader><SidebarContent className="gap-0 px-2 py-4"><p className="px-3 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#72727b] group-data-[collapsible=icon]:hidden">Workspace</p><SidebarMenu>{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-lg px-3 text-[#9a9aa2] hover:bg-[#222226] hover:text-[#e8e8ea] data-[active=true]:bg-[#D4734E]/12 data-[active=true]:text-[#e8e8ea]"><item.icon className={`h-4 w-4 ${location === item.path ? "text-[#D4734E]" : ""}`} /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="border-t border-[#2a2a30] p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-[#222226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4734E] group-data-[collapsible=icon]:justify-center"><Avatar className="h-9 w-9 shrink-0 border border-[#3a3a42]"><AvatarFallback className="bg-[#222226] text-xs font-medium text-[#D4734E]">{user?.name?.charAt(0).toUpperCase() ?? "T"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium text-[#e8e8ea]">{user?.name || user?.username || "Trader"}</p><p className="mt-1 truncate text-xs text-[#9a9aa2]">Local secure session</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48 border-[#3a3a42] bg-[#1a1a1e] text-[#e8e8ea]"><DropdownMenuItem onClick={logout} className="cursor-pointer text-[#ff6b6b] focus:bg-[#222226] focus:text-[#ff6b6b]"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-[#D4734E]/40 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => !isCollapsed && setIsResizing(true)} /></div><SidebarInset className="bg-[#121214]">{isMobile ? <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[#2a2a30] bg-[#17171a]/95 px-3 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg text-[#e8e8ea] hover:bg-[#222226]" /><span className="text-sm font-medium text-[#e8e8ea]">{activeMenuItem?.label ?? "TMT"}</span></div> : null}<main className="min-h-[100dvh] flex-1 p-4 sm:p-6 lg:p-7">{children}</main></SidebarInset></>;
}
