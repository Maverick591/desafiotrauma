import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeedbackReviewCard } from './FeedbackReviewCard.jsx'

describe('feedback review', () => {
  it('só habilita aprovação após texto anonimizado e trecho aprovado', async () => {
    const user = userEvent.setup()
    render(<FeedbackReviewCard review={{ id: '1', feedback_id: 'feedback-1', status: 'pending' }} formatDate={() => '22/07/2026'} onReview={vi.fn()} />)
    const approve = screen.getByRole('button', { name: 'Aprovar' })
    expect(approve).toBeDisabled()
    await user.type(screen.getByLabelText('Texto anonimizado'), 'Texto sem identificadores')
    expect(approve).toBeDisabled()
    await user.type(screen.getByLabelText('Trecho aprovado'), 'Trecho público')
    expect(approve).toBeEnabled()
  })
})
