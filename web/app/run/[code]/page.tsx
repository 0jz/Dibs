import { readDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const steps = [
  "Download the agent with the button below and open it.",
  "If Windows warns about an unknown publisher, choose More info, then Run anyway.",
  "Type the code when asked. Keep the window open until it says Done.",
];

export default async function RunPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const db = await readDb();
  const session = db.sessions.find((s) => s.code === code);
  const usable = session?.status === "waiting";
  const exe = Boolean(process.env.DIBS_AGENT_URL);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-amber-300">Dibs test</p>
      {usable ? (
        <>
          <h1 className="mt-3 text-3xl font-semibold text-white">Your code</h1>
          <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] px-6 py-8 text-center font-mono text-6xl font-semibold tracking-[0.2em] text-white">
            {code}
          </div>
          <ol className="mt-8 space-y-3 text-zinc-300">
            {steps.map((text, i) => (
              <li key={text} className="flex gap-3">
                <span className="text-amber-300">{i + 1}.</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <a
            href="/download"
            className="mt-8 block rounded-xl bg-white px-5 py-4 text-center text-lg font-medium text-black hover:bg-zinc-200"
          >
            Download the agent {exe ? "(Windows)" : "(Python script)"}
          </a>
          {!exe && (
            <p className="mt-3 text-sm text-zinc-500">
              This needs Python 3. Run it with <span className="font-mono">python dibs_agent.py</span>.
            </p>
          )}
        </>
      ) : (
        <>
          <h1 className="mt-3 text-3xl font-semibold text-white">This code can&apos;t be used</h1>
          <p className="mt-3 text-zinc-400">
            {session
              ? "It was already used. Ask the shop to start a new test."
              : "We don't know this code. Check it with the shop."}
          </p>
        </>
      )}
    </main>
  );
}
