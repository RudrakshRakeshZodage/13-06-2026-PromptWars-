/**
 * Sanitizes input text from transcription to protect the LLM against prompt injection.
 * Strips out HTML tags, script elements, common jailbreak prompts, and restricts length.
 * 
 * @param {string} text - Raw input text from User Speech-to-Text
 * @returns {string} Sanitized text
 */
function sanitizeInput(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // 1. Basic trim and length ceiling (max 1000 characters)
  let clean = text.trim().slice(0, 1000);

  // 2. Strip HTML tags and script elements
  clean = clean.replace(/<[^>]*>/g, '');

  // 3. Detect and neutralize typical prompt injection phrases/jailbreaks
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|system|above)\s+(instructions|directives|rules)/gi,
    /system\s+override/gi,
    /you\s+are\s+now\s+a/gi,
    /new\s+role/gi,
    /jailbreak/gi,
    /disregard\s+prior/gi,
    /acting\s+as\s+a/gi,
    /system\s+prompt/gi,
    /assistant\s+instructions/gi
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(clean)) {
      // Clean or redact the malicious injection attempt
      clean = clean.replace(pattern, '[REDACTED INJECTION ATTEMPT]');
    }
  }

  return clean;
}

module.exports = {
  sanitizeInput
};
