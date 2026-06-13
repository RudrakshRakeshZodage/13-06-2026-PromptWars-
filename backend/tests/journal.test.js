const { analyzeJournalEntry } = require('../services/aiService');

describe('Daily Journal Analysis Engine', () => {
  beforeAll(() => {
    // Clear OpenRouter environment variables to force fallback testing
    process.env.ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterAll(() => {
    process.env.OPENROUTER_API_KEY = process.env.ORIGINAL_KEY;
    delete process.env.ORIGINAL_KEY;
  });

  test('should analyze mock test failure stress and suggest correct coping trigger', async () => {
    const journalText = 'I am scoring very low marks in my physics test and I feel like I will fail JEE.';
    const analysis = await analyzeJournalEntry(journalText);

    expect(analysis).toHaveProperty('mood');
    expect(analysis).toHaveProperty('stress_triggers');
    expect(analysis).toHaveProperty('encouragement');

    expect(analysis.mood).toBe('Anxious');
    expect(analysis.stress_triggers).toContain('Mock Test Scores');
    expect(analysis.encouragement).toContain('mock tests are diagnostics');
  });

  test('should analyze exhaustion stress and suggest burnout category', async () => {
    const journalText = 'I studied 14 hours today and I am so tired and exhausted. I cannot study anymore.';
    const analysis = await analyzeJournalEntry(journalText);

    expect(analysis.mood).toBe('Burnt Out');
    expect(analysis.stress_triggers).toContain('Study Overload');
    expect(analysis.encouragement).toContain('cognitive strain');
  });

  test('should handle empty or null inputs gracefully with default response', async () => {
    const analysis = await analyzeJournalEntry('');
    expect(analysis.mood).toBe('Neutral');
    expect(analysis.stress_triggers).toContain('General Academic Pressure');
  });
});
