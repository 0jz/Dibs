import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-100">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <path d="M4 12 L8 5 H24 L28 12 Z" fill="#f5a524" />
        <path d="M4 12 q3 4 6 0 q3 4 6 0 q3 4 6 0 q3 4 6 0" fill="none" stroke="#f5a524" strokeWidth="2" />
        <rect x="6" y="15" width="20" height="12" rx="1.5" fill="none" stroke="#e4e4e7" strokeWidth="2" />
        <path d="M11 21 h10" stroke="#e4e4e7" strokeWidth="2" />
      </svg>
      <span className="text-lg">Dibs</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/6 bg-[#0b0b0d]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm text-zinc-400">
          <Link href="/#listings" className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-zinc-100">Browse</Link>
          <Link href="/#how" className="hidden rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-zinc-100 sm:block">How it works</Link>
          <Link href="/verify" className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-zinc-100">Verify delivery</Link>
          <Link href="/admin" className="ml-1 rounded-md border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20 hover:text-zinc-100">Staff</Link>
        </nav>
      </div>
    </header>
  );
}
