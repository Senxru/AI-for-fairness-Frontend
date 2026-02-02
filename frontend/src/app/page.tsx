import Link from "next/link";

export default function Home() {
  const roles = [
    {
      name: "Judge",
      description:
        "Personalized analytics, bias alerts, and transparent AI support for rulings.",
      href: "/judge/login",
      tag: "Judge Portal",
    },
    {
      name: "Court Authority",
      description:
        "Check for bias, input case data.",
      href: "/court-authority/login",
      tag: "Authority Portal",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
      >
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-500/40 blur-[160px]" />
        <div className="absolute bottom-0 left-0 h-80 w-80 translate-y-1/3 rounded-full bg-emerald-400/30 blur-[180px]" />
        <div className="absolute bottom-0 right-0 h-96 w-96 translate-y-1/3 rounded-full bg-indigo-500/30 blur-[200px]" />
      </div>

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-lg font-semibold tracking-tight">
          AI for Fairness
        </div>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a className="transition hover:text-white" href="#mission">
            Mission
          </a>
          <a className="transition hover:text-white" href="#roles">
            Roles
          </a>
          <a className="transition hover:text-white" href="#contact">
            Contact
          </a>
        </nav>
        <Link
          href="#roles"
          className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:border-white/60"
        >
          Explore portals
        </Link>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-12">
        <section
          id="mission"
          className="flex max-w-4xl flex-col items-center gap-6 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">
            Equitable Intelligence
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-slate-50 sm:text-5xl">
            AI for fairness in judicial decisions
          </h1>
          <p className="text-lg text-slate-300">
            Empower judges and court authorities with transparent AI guidance,
            objective scoring, and proactive bias detection throughout every
            decision.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/judge/login"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
            >
              Judge access
            </Link>
            <Link
              href="/court-authority/login"
              className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/60"
            >
              Authority access
            </Link>
          </div>
        </section>

        <section
          id="roles"
          className="mt-16 w-full max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_120px_rgba(15,23,42,0.8)] backdrop-blur"
        >
          <div className="mb-10 text-center">
            <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">
              Choose your role
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              Dedicated pathways for judicial roles
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Secure workspaces tailored to the responsibilities of judges and
              court authorities with distinct onboarding, analytics, and audit
              trails.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {roles.map((role) => (
              <Link
                key={role.name}
                href={role.href}
                className="group flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-8 transition hover:-translate-y-1 hover:border-white/40 hover:bg-slate-900/70"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">
                    {role.tag}
                  </p>
                  <h3 className="mt-4 text-2xl font-semibold text-white">
                    {role.name}
                  </h3>
                  <p className="mt-4 text-sm text-slate-300">
                    {role.description}
                  </p>
                </div>
                <div className="mt-10 flex items-center text-sm font-semibold text-sky-300">
                  Proceed to sign up / log in
                  <svg
                    className="ml-2 h-4 w-4 transition group-hover:translate-x-1"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer
        id="contact"
        className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-slate-400"
      >
        <p>© {new Date().getFullYear()} AI for Fairness Initiative</p>
        <div className="flex items-center gap-4">
          <a className="hover:text-white" href="mailto:contact@aifairness.org">
            contact@aifairness.org
          </a>
          <a className="hover:text-white" href="#mission">
            Privacy & Ethics
          </a>
        </div>
      </footer>
    </div>
  );
}
