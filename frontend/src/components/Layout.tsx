import { Outlet } from "react-router-dom";

import { Backdrop } from "./Backdrop";
import { BackButton } from "./BackButton";
import { Footer } from "./Footer";
import { NavBar } from "./NavBar";

export function Layout() {
  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Backdrop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <NavBar />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <BackButton />
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
