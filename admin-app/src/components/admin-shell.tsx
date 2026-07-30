import { useEffect, useRef, useState } from "react";
import { BarChart3, LogOut, MenuIcon, Monitor, Moon, Sun, Utensils, QrCode, X } from "lucide-react";

import type { AdminRoute } from "@/lib/routes";
import { createThemeController, readTheme, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider,
} from "@/components/ui/sidebar";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const ADMIN_NAVIGATION = [
  { page: "menu", href: "/admin/menu", label: "Управление меню", icon: Utensils },
  { page: "tables", href: "/admin/tables", label: "Столы и QR-коды", icon: QrCode },
  { page: "stats", href: "/stats", label: "Статистика", icon: BarChart3 },
] as const;

export function AdminShell({
  route, onNavigate, onLogout, children,
}: {
  route: AdminRoute;
  onNavigate: (path: string) => void;
  onLogout: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const controller = useRef<ReturnType<typeof createThemeController> | null>(null);
  useEffect(() => {
    controller.current = createThemeController();
    return () => controller.current?.destroy();
  }, []);
  useEffect(() => {
    document.title = route.title;
    heading.current?.focus();
  }, [route]);
  const selectTheme = (value: string) => {
    const next = value as Theme;
    controller.current?.set(next);
    setTheme(next);
  };
  const labels: Record<Theme, string> = { light: "Светлая", dark: "Тёмная", system: "Системная" };
  const navigation = (closeMobile = false) => (
    <SidebarMenu>
      {ADMIN_NAVIGATION.map((item) => (
        <SidebarMenuItem key={item.page}>
          <SidebarMenuButton asChild isActive={route.page === item.page}>
            <a href={item.href} aria-current={route.page === item.page ? "page" : undefined} onClick={(event) => { event.preventDefault(); if (closeMobile) setMobileOpen(false); onNavigate(item.href); }}>
              <item.icon /><span>{item.label}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
  return (
    <SidebarProvider>
      <div className="hidden md:block">
        <Sidebar collapsible="none">
          <SidebarHeader className="p-4 font-semibold">Панель управления</SidebarHeader>
          <SidebarContent className="p-2">{navigation()}</SidebarContent>
        </Sidebar>
      </div>
      <SidebarInset>
        <header className="flex min-h-16 min-w-0 flex-wrap items-center gap-2 overflow-hidden border-b px-4 sm:flex-nowrap">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" className="min-h-11 min-w-11 md:hidden" aria-label="Открыть меню"><MenuIcon data-icon="inline-start" /></Button>
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false}>
              <SheetHeader>
                <SheetTitle>Навигация</SheetTitle>
                <SheetDescription>Разделы панели управления</SheetDescription>
              </SheetHeader>
              <nav className="p-4" aria-label="Основная навигация">{navigation(true)}</nav>
              <SheetClose asChild>
                <Button variant="ghost" className="absolute top-3 right-3 min-h-11 min-w-11" aria-label="Закрыть меню"><X /></Button>
              </SheetClose>
            </SheetContent>
          </Sheet>
          <span className="min-w-0 flex-1 truncate font-medium">{route.heading}</span>
          <div className="ml-auto flex shrink-0 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-h-11 min-w-11" aria-label={`Тема: ${labels[theme]}`}>
                  {theme === "dark" ? <Moon data-icon="inline-start" /> : theme === "light" ? <Sun data-icon="inline-start" /> : <Monitor data-icon="inline-start" />}<span className="hidden sm:inline">{labels[theme]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={theme} onValueChange={selectTheme}>
                  <DropdownMenuRadioItem value="light">Светлая</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Тёмная</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">Системная</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="min-h-11 min-w-11" aria-label="Выйти" onClick={onLogout}>
              <LogOut data-icon="inline-start" /><span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <h1 ref={heading} tabIndex={-1} className="mb-6 min-w-0 text-2xl font-semibold [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-ring">{route.heading}</h1>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
