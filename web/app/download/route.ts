// The agent installer. Point DIBS_AGENT_URL at the built dibs-agent.exe (a GitHub
// release asset or Vercel Blob). Without it, fall back to the Python script.
export async function GET(request: Request) {
  const target = process.env.DIBS_AGENT_URL || "/dibs_agent.py";
  return Response.redirect(new URL(target, request.url), 302);
}
