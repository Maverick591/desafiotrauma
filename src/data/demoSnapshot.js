export const demoSnapshot = {
  metadata: {
    published_at: '2026-07-22T12:00:00.000Z',
    generated_at: '2026-07-22T12:00:00.000Z',
    source_updated_at: '2026-07-20T18:30:00.000Z',
    privacy_note: 'Grupos com menos de 5 participantes distintos são excluídos dos detalhes e dos totais públicos.',
  },
  filters: {
    periods: ['Últimos 12 meses', '2026', '2025'],
    presentations: ['Todas as apresentações', 'Trauma abdominal', 'Trauma torácico'],
    profiles: ['Todos os perfis', 'Residente', 'Especialista'],
    formats: ['Todos os formatos', 'Quiz', 'Escala', 'Nuvem de palavras'],
    topics: ['Todos os assuntos', 'Abdome', 'Tórax', 'Choque'],
    difficulties: ['Todas as dificuldades', 'Básica', 'Intermediária', 'Avançada'],
  },
  overview: {
    presentations: 38,
    participants: 1248,
    responses: 7842,
    response_rate: 82,
    accuracy_rate: 74,
    experience_score: 4.7,
    trend: [
      { label: 'Fev', participation: 188, accuracy: 68 },
      { label: 'Mar', participation: 234, accuracy: 71 },
      { label: 'Abr', participation: 286, accuracy: 72 },
      { label: 'Mai', participation: 319, accuracy: 76 },
      { label: 'Jun', participation: 364, accuracy: 78 },
      { label: 'Jul', participation: 402, accuracy: 80 },
    ],
    highlights: [
      { title: 'Participação consistente', detail: '82% das interações propostas foram concluídas.' },
      { title: 'Ganho sustentado', detail: 'A acurácia avançou 12 p.p. no semestre.' },
    ],
  },
  participation: {
    total_participants: 1248,
    total_responses: 7842,
    response_rate: 82,
    evaluators: 906,
    evaluation_rate: 74,
    presentations: 38,
    trend: [
      { label: 'Fev', participants: 188, responses: 892 },
      { label: 'Mar', participants: 234, responses: 1048 },
      { label: 'Abr', participants: 286, responses: 1190 },
      { label: 'Mai', participants: 319, responses: 1324 },
      { label: 'Jun', participants: 364, responses: 1580 },
      { label: 'Jul', participants: 402, responses: 1808 },
    ],
    by_profile: [
      { label: 'Residente', value: 52 },
      { label: 'Especialista', value: 31 },
      { label: 'Graduando', value: 17 },
    ],
    by_format: [
      { label: 'Quiz', value: 61 },
      { label: 'Escala', value: 24 },
      { label: 'Texto livre', value: 15 },
    ],
  },
  learning: {
    accuracy_rate: 74,
    questions: 286,
    answers: 6420,
    improvement: 12,
    trend: [
      { label: 'Fev', accuracy: 68 },
      { label: 'Mar', accuracy: 71 },
      { label: 'Abr', accuracy: 72 },
      { label: 'Mai', accuracy: 76 },
      { label: 'Jun', accuracy: 78 },
      { label: 'Jul', accuracy: 80 },
    ],
    by_difficulty: [
      { label: 'Básica', accuracy: 88, questions: 76 },
      { label: 'Intermediária', accuracy: 74, questions: 142 },
      { label: 'Avançada', accuracy: 58, questions: 68 },
    ],
    question_performance: [
      { question: 'Sequência inicial no choque hemorrágico', topic: 'Choque', accuracy: 91, responses: 214 },
      { question: 'Indicação de laparotomia imediata', topic: 'Abdome', accuracy: 78, responses: 198 },
      { question: 'Critérios de toracotomia de reanimação', topic: 'Tórax', accuracy: 54, responses: 186 },
    ],
  },
  experience: {
    score: 4.7,
    nps: 78,
    evaluations: 906,
    evaluation_rate: 74,
    recommendation_rate: 92,
    criteria: [
      { label: 'Aplicabilidade clínica', score: 4.8 },
      { label: 'Clareza da discussão', score: 4.7 },
      { label: 'Segurança para participar', score: 4.9 },
      { label: 'Ritmo da sessão', score: 4.4 },
    ],
    trend: [
      { label: 'Fev', score: 4.4, nps: 68 },
      { label: 'Mar', score: 4.5, nps: 71 },
      { label: 'Abr', score: 4.6, nps: 74 },
      { label: 'Mai', score: 4.7, nps: 77 },
      { label: 'Jun', score: 4.8, nps: 81 },
      { label: 'Jul', score: 4.7, nps: 78 },
    ],
  },
  topics: {
    coverage: 24,
    mapped_questions: 272,
    opportunities: 6,
    items: [
      { topic: 'Trauma abdominal', questions: 62, accuracy: 81, opportunity: 'Manter complexidade progressiva' },
      { topic: 'Choque hemorrágico', questions: 47, accuracy: 69, opportunity: 'Reforçar endpoints de ressuscitação' },
      { topic: 'Trauma torácico', questions: 54, accuracy: 63, opportunity: 'Revisar indicações operatórias' },
      { topic: 'Trauma vascular', questions: 29, accuracy: 57, opportunity: 'Ampliar casos de tomada de decisão' },
    ],
  },
  metric_dictionary: [
    { metric: 'Taxa de resposta', definition: 'Respostas válidas divididas pelas interações disponíveis.' },
    { metric: 'Acurácia', definition: 'Respostas corretas entre questões objetivas válidas.' },
    { metric: 'NPS', definition: 'Promotores menos detratores entre avaliações elegíveis.' },
  ],
  public_files: [
    { name: 'Dicionário de métricas', description: 'Critérios e fórmulas desta publicação.', url: '#' },
  ],
}

// Uma visão agregada permite que QA valide a aplicação real de um filtro.
// Combinações não listadas devem produzir o estado vazio, nunca reutilizar o total global.
demoSnapshot.filters.combinations = [{
  filters: { topic: 'Tórax' },
  snapshot: {
    overview: { ...demoSnapshot.overview, presentations: 9, participants: 318, responses: 1874, accuracy_rate: 69 },
    participation: { ...demoSnapshot.participation, total_participants: 318, total_responses: 1874, presentations: 9 },
    learning: { ...demoSnapshot.learning, accuracy_rate: 69, questions: 54, answers: 1612 },
    experience: { ...demoSnapshot.experience, evaluations: 226 },
    topics: { ...demoSnapshot.topics, coverage: 1, mapped_questions: 54, items: demoSnapshot.topics.items.filter((item) => item.topic === 'Trauma torácico') },
  },
}]
