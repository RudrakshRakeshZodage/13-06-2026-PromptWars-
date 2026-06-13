const request = require('supertest');

// Mock cognitive services to test route logic cleanly
jest.mock('../services/aiService', () => {
  return {
    generateWellnessResponse: jest.fn().mockResolvedValue({
      emotional_analysis: 'Performance Anxiety',
      avatar_motor_cue: 'empathetic_nod',
      spoken_script: 'I hear you, beta. Let us pause.',
      multimedia_suggestion: {
        title: '1-MINUTE BOX BREATHING',
        type: 'youtube_embed_id',
        value: 'dIUTsTz8P1c',
        accessible_rationale: 'Guided breathing session.'
      }
    }),
    analyzeJournalEntry: jest.fn().mockResolvedValue({
      mood: 'Anxious',
      stress_triggers: ['Mock Test Scores'],
      coping_strategy: 'Formulate a targeting schedule.',
      mindfulness_exercise: '4-7-8 breathing.',
      encouragement: 'Scores will improve.',
      resource: {
        title: 'Guided meditation',
        type: 'youtube_embed_id',
        value: 'X3H188GgCgI',
        accessible_rationale: 'Anxiety relief meditations.'
      }
    })
  };
});

// Import express app
const app = require('../server');

describe('Express REST Endpoints Integration', () => {
  test('GET /api/health should return status ok', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.message).toContain('Swasthya Backend');
  });

  test('POST /api/wellness should return structured wellness payload', async () => {
    const res = await request(app)
      .post('/api/wellness')
      .send({ text: 'I am highly stressed about JEE' })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body).toHaveProperty('emotional_analysis');
    expect(res.body).toHaveProperty('avatar_motor_cue');
    expect(res.body.avatar_motor_cue).toBe('empathetic_nod');
    expect(res.body.spoken_script).toContain('I hear you');
  });

  test('POST /api/wellness with empty input should return 400', async () => {
    await request(app)
      .post('/api/wellness')
      .send({ text: '' })
      .expect(400);
  });

  test('POST /api/journal should return structured journal logs analysis', async () => {
    const res = await request(app)
      .post('/api/journal')
      .send({ text: 'Studied for 12 hours and felt pressured by parents' })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.mood).toBe('Anxious');
    expect(res.body.stress_triggers).toContain('Mock Test Scores');
    expect(res.body.coping_strategy).toContain('targeting schedule');
  });

  test('POST /api/journal with missing body should return 400', async () => {
    await request(app)
      .post('/api/journal')
      .send({})
      .expect(400);
  });
});
