import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  signInWithOtp: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { signInWithOtp: mocks.signInWithOtp },
    functions: { invoke: mocks.invoke },
    rpc: mocks.rpc,
  },
}))

import {
  MAX_UPLOAD_BYTES,
  buildAdminRedirectUrl,
  buildDispatchPayload,
  dispatchIngestion,
  reviewFeedback,
  reviewQuestion,
  sendMagicLink,
  uploadManualImport,
} from './adminApi.js'

describe('admin API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoke.mockResolvedValue({ data: { accepted: true }, error: null })
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
    mocks.signInWithOtp.mockResolvedValue({ error: null })
  })

  it('documenta o deep link e impede cadastro no magic link', async () => {
    expect(buildAdminRedirectUrl('https://example.test')).toBe('https://example.test/desafiotrauma/admin')
    await sendMagicLink('admin@example.test')
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'admin@example.test',
      options: {
        emailRedirectTo: buildAdminRedirectUrl(window.location.origin),
        shouldCreateUser: false,
      },
    })
  })

  it('envia somente o contrato permitido ao dispatch', async () => {
    expect(buildDispatchPayload('manual')).toEqual({ mode: 'manual', force_reclassify: false, dry_run: false })
    await dispatchIngestion('incremental', 'presentation-42')
    expect(mocks.invoke).toHaveBeenCalledWith('dispatch-ingestion', {
      body: { mode: 'incremental', presentation_id: 'presentation-42', force_reclassify: false, dry_run: false },
    })
  })

  it('envia os campos editoriais obrigatórios ao review_feedback', async () => {
    await reviewFeedback('00000000-0000-4000-8000-000000000001', 'approved', {
      anonymizedText: ' Texto seguro ',
      approvedExcerpt: ' Trecho aprovado ',
      reviewNotes: ' Revisado ',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('review_feedback', {
      p_feedback_id: '00000000-0000-4000-8000-000000000001',
      p_status: 'approved',
      p_anonymized_text: 'Texto seguro',
      p_approved_excerpt: 'Trecho aprovado',
      p_review_notes: 'Revisado',
    })
  })

  it('envia a taxonomia completa ao review_question', async () => {
    await reviewQuestion('00000000-0000-4000-8000-000000000002', {
      primaryTopic: 'Tórax', subtopic: 'Hemotórax', cognitiveTask: 'conduta',
      bloomLevel: 'aplicar', predictedDifficulty: 'medium', reviewNotes: 'Conferido',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('review_question', expect.objectContaining({
      p_primary_topic: 'Tórax', p_subtopic: 'Hemotórax', p_cognitive_task: 'conduta',
      p_bloom_level: 'aplicar', p_predicted_difficulty: 'medium', p_review_notes: 'Conferido',
    }))
  })

  it('rejeita arquivos acima de 50 MB antes de ler bytes', async () => {
    const arrayBuffer = vi.fn()
    await expect(uploadManualImport({ name: 'grande.xlsx', size: MAX_UPLOAD_BYTES + 1, arrayBuffer }, 'user-id', {
      importKind: 'mentimeter_export', presentationExternalId: 'p1',
      presentationTitle: 'Desafio Trauma - 27/05/2026', eventDate: '2026-05-27',
    }))
      .rejects.toThrow('limite de 50 MB')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })
})
