// Mock the Google Gen AI library before importing anything
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () => JSON.stringify({
                emotional_analysis: 'High Stress Imminent',
                avatar_motor_cue: 'calm_breathing_motion',
                spoken_script: 'Please slow down and breathe with me.',
                multimedia_suggestion: {
                  title: '1-MINUTE BOX BREATHING',
                  type: 'youtube_embed_id',
                  value: 'kYc-m7f2P8w',
                  accessible_rationale: 'Guided box breathing exercise to relax.'
                }
              })
            }
          })
        })
      };
    })
  };
});

// Set environment variable BEFORE importing aiService
process.env.GEMINI_API_KEY = 'mock-key-for-testing';

const { generateWellnessResponse } = require('../services/aiService');

describe('AI Cognitive Wellness Service', () => {
  test('should generate structured response matching the schema from the mocked LLM model', async () => {
    // Send a message that won't trigger standard fallbacks just in case, but since GEMINI_API_KEY is defined
    // and aiModel is initialized, it should hit the mock model.
    const response = await generateWellnessResponse('General test message');
    
    // Validate output structure and schemas
    expect(response).toHaveProperty('emotional_analysis');
    expect(response).toHaveProperty('avatar_motor_cue');
    expect(response).toHaveProperty('spoken_script');
    expect(response).toHaveProperty('multimedia_suggestion');

    expect(response.avatar_motor_cue).toBe('calm_breathing_motion');
    expect(response.spoken_script).toBe('Please slow down and breathe with me.');
    expect(response.multimedia_suggestion).toEqual({
      title: '1-MINUTE BOX BREATHING',
      type: 'youtube_embed_id',
      value: 'kYc-m7f2P8w',
      accessible_rationale: 'Guided box breathing exercise to relax.'
    });
  });

  test('should fallback to rule-based mock matching specific keywords when API key is missing or model throws error', async () => {
    // To test the fallback when aiModel fails or throws, we can verify the fallback outputs.
    // Let's test a message with 'tired' which triggers burnout.
    // Note: since the module was required with GEMINI_API_KEY, aiModel is active, but we can verify
    // the fallback execution by passing an empty key condition or matching the fallback catalog logic.
    // Let's temporarily delete the key and clear cache to test fallback.
    jest.resetModules();
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    
    const freshAiService = require('../services/aiService');
    const response = await freshAiService.generateWellnessResponse('I am so tired and exhausted');
    
    expect(response.emotional_analysis).toBe('General Burnout / Fatigue');
    expect(response.avatar_motor_cue).toBe('calm_breathing_motion');
    expect(response.multimedia_suggestion.title).toBe('GROUNDING NATURE SCENE');
    
    // Restore
    process.env.GEMINI_API_KEY = originalEnv;
  });
});
