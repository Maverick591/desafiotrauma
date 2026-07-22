import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function buildAdminRedirectUrl(origin = window.location.origin) {
  return new URL('/desafiotrauma/admin', origin).toString()
}

/**
 * Sends a one-time Magic Link only to an existing allowlisted account.
 * `shouldCreateUser: false` is intentional: the public login form must never
 * turn an unknown email address into a new Supabase Auth user.
 */
export async function sendMagicLink(email) {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado neste ambiente.')
  const redirectTo = buildAdminRedirectUrl()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  })
  if (error) throw error
}

export async function getAdminAccess() {
  if (!isSupabaseConfigured) return { session: null, allowed: false, configured: false }
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return { session: null, allowed: false, configured: true }
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return { session: null, allowed: false, configured: true }
  const { data: allowed, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return { session: sessionData.session, user: userData.user, allowed: allowed === true, configured: true }
}

export async function signOutAdmin() {
  if (supabase) await supabase.auth.signOut()
}

export async function loadAdminDashboard() {
  const [reviews, questions, runs, imports, files] = await Promise.all([
    supabase.from('feedback_reviews').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.from('mentimeter_questions')
      .select('id,prompt,primary_topic,subtopic,cognitive_task,bloom_level,predicted_difficulty,review_notes,needs_review,updated_at')
      .eq('needs_review', true)
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase.from('pipeline_runs').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('manual_imports').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('source_files').select('*').order('uploaded_at', { ascending: false }).limit(30),
  ])
  const failure = [reviews, questions, runs, imports, files].find((result) => result.error)
  if (failure) throw failure.error
  return { reviews: reviews.data || [], questions: questions.data || [], runs: runs.data || [], imports: imports.data || [], files: files.data || [] }
}

export async function reviewFeedback(feedbackId, status, values = {}) {
  const { data, error } = await supabase.rpc('review_feedback', {
    p_feedback_id: feedbackId,
    p_status: status,
    p_anonymized_text: values.anonymizedText?.trim() || null,
    p_approved_excerpt: values.approvedExcerpt?.trim() || null,
    p_review_notes: values.reviewNotes?.trim() || null,
  })
  if (error) throw error
  return data
}

export async function reviewQuestion(questionId, values) {
  const { data, error } = await supabase.rpc('review_question', {
    p_question_id: questionId,
    p_primary_topic: values.primaryTopic.trim(),
    p_subtopic: values.subtopic.trim(),
    p_cognitive_task: values.cognitiveTask.trim(),
    p_bloom_level: values.bloomLevel.trim(),
    p_predicted_difficulty: values.predictedDifficulty.trim(),
    p_review_notes: values.reviewNotes?.trim() || null,
  })
  if (error) throw error
  return data
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function inferMimeType(file) {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return {
    csv: 'text/csv',
    json: 'application/json',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[extension] || 'application/octet-stream'
}

export async function uploadManualImport(file, userId, metadata) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('O arquivo excede o limite de 50 MB.')
  }
  if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.xlsx')) {
    throw new Error('Envie a exportação Spreadsheet do Mentimeter em formato XLSX.')
  }
  const importKind = metadata?.importKind || 'mentimeter_export'
  const presentationExternalId = metadata?.presentationExternalId?.trim()
  const presentationTitle = metadata?.presentationTitle?.trim()
  const eventDate = metadata?.eventDate
  if (!presentationExternalId || !presentationTitle || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate || '')) {
    throw new Error('Informe o ID, o título e a data da apresentação.')
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
  const storagePath = `${userId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
  const mimeType = inferMimeType(file)
  const { error: uploadError } = await supabase.storage.from('mentimeter-results').upload(storagePath, file, {
    contentType: mimeType,
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data: sourceFile, error: sourceError } = await supabase.from('source_files').insert({
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: mimeType,
    byte_size: file.size,
    sha256: toHex(digest),
    presentation_external_id: presentationExternalId,
    parser_version: '1.0',
  }).select().single()
  if (sourceError) {
    await supabase.storage.from('mentimeter-results').remove([storagePath])
    throw sourceError
  }

  const { data: manualImport, error: importError } = await supabase.from('manual_imports').insert({
    source_file_id: sourceFile.id,
    import_kind: importKind,
    presentation_external_id: presentationExternalId,
    presentation_title: presentationTitle,
    event_date: eventDate,
  }).select().single()
  if (importError) {
    await supabase.from('source_files').delete().eq('id', sourceFile.id)
    await supabase.storage.from('mentimeter-results').remove([storagePath])
    throw importError
  }
  return { sourceFile, manualImport }
}

export async function createSourceDownload(path) {
  const { data, error } = await supabase.storage.from('mentimeter-results').createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}

export function buildDispatchPayload(mode, presentationId) {
  if (!['manual', 'incremental', 'backfill'].includes(mode)) throw new Error('Modo de sincronização inválido.')
  return {
    mode,
    ...(presentationId ? { presentation_id: presentationId } : {}),
    force_reclassify: false,
    dry_run: false,
  }
}

export async function dispatchIngestion(mode, presentationId) {
  const body = buildDispatchPayload(mode, presentationId)
  const { data, error } = await supabase.functions.invoke('dispatch-ingestion', {
    body,
  })
  if (error) throw error
  return data
}

export async function dispatchDashboardRefresh() {
  return dispatchIngestion('incremental')
}
