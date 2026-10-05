import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/auth";
import { STORE_NAME } from "@/lib/db";
import { Logo } from "@/components/SiteHeader";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isStaff())) redirect("/admin/login");

  return (
    <>
      <header className="border-b border-white/6 bg-[#0e0e11]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-xs font-medium text-amber-200">Staff</span>
            <span className="hidden text-sm text-zinc-500 sm:inline">{STORE_NAME}</span>
          </div>
          <nav className="flex items-center gap-1 text-sm text-zinc-400">
            <Link href="/admin" className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-zinc-100">Dashboard</Link>
            <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-zinc-100">View site</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
