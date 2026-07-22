import { createClient } from "npm:@supabase/supabase-js@2.110.8";

type DispatchRequest = {
  mode: "incremental" | "backfill" | "manual";
  presentation_id?: string;
  force_reclassify?: boolean;
  dry_run?: boolean;
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const ALLOWED_KEYS = new Set(["mode", "presentation_id", "force_reclassify", "dry_run"]);
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server secret: ${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let input: DispatchRequest;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_payload" }, 400);
  if (Object.keys(input).some((key) => !ALLOWED_KEYS.has(key))) return json({ error: "unknown_input" }, 400);
  if (!["incremental", "backfill", "manual"].includes(input.mode)) return json({ error: "invalid_mode" }, 400);
  if (input.presentation_id !== undefined && (
    typeof input.presentation_id !== "string" ||
    input.presentation_id.trim().length === 0 ||
    input.presentation_id.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(input.presentation_id)
  )) return json({ error: "invalid_presentation_id" }, 400);
  if (input.force_reclassify !== undefined && typeof input.force_reclassify !== "boolean") {
    return json({ error: "invalid_force_reclassify" }, 400);
  }
  if (input.dry_run !== undefined && typeof input.dry_run !== "boolean") return json({ error: "invalid_dry_run" }, 400);

  try {
    const supabaseUrl = required("SUPABASE_URL");
    const anonKey = required("SUPABASE_ANON_KEY");
    const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const token = authorization.slice("Bearer ".length);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser(token);
    const callerEmail = userData.user?.email?.trim().toLowerCase();
    if (userError || !userData.user || !callerEmail) return json({ error: "unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: administrator, error: administratorError } = await adminClient
      .from("admin_users")
      .select("email")
      .eq("email", callerEmail)
      .eq("active", true)
      .maybeSingle();
    if (administratorError) throw administratorError;
    if (!administrator) return json({ error: "forbidden" }, 403);

    const repository = required("GITHUB_REPOSITORY");
    if (!REPOSITORY.test(repository)) throw new Error("GITHUB_REPOSITORY must use owner/repo format");
    const workflowFile = required("GITHUB_WORKFLOW_FILE");
    const workflowRef = required("GITHUB_WORKFLOW_REF");
    const githubToken = required("GITHUB_WORKFLOW_TOKEN");
    const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    const workflowInputs = {
      mode: input.mode,
      presentation_id: input.presentation_id?.trim() ?? "",
      force_reclassify: input.force_reclassify ?? false,
      dry_run: input.dry_run ?? false,
    };
    const githubResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${githubToken}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: workflowRef, inputs: workflowInputs }),
    });

    const audit = {
      actor_id: userData.user.id,
      action: githubResponse.ok ? "ingestion.dispatched" : "ingestion.dispatch_failed",
      entity_type: "mentimeter_presentation",
      entity_id: workflowInputs.presentation_id || null,
      request_metadata: {
        mode: workflowInputs.mode,
        force_reclassify: workflowInputs.force_reclassify,
        dry_run: workflowInputs.dry_run,
        ...(githubResponse.ok ? {} : { github_status: githubResponse.status }),
      },
    };
    const { error: auditError } = await adminClient.from("admin_audit_log").insert(audit);
    if (auditError) throw auditError;
    if (!githubResponse.ok) return json({ error: "dispatch_failed" }, 502);

    return json({ accepted: true, inputs: workflowInputs }, 202);
  } catch (error) {
    console.error("dispatch-ingestion failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "server_misconfigured" }, 500);
  }
});
