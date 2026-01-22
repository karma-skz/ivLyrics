/**
 * Pollinations.ai AI Addon for ivLyrics
 * Pollinations.ai를 사용한 번역, 발음, TMI 생성 (무료 API)
 * 
 * @author ivLis STUDIO
 * @version 1.0.0
 */

(() => {
    'use strict';

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'pollinations',
        name: 'Pollinations.ai',
        author: 'ivLis STUDIO',
        description: {
            ko: 'Pollinations.ai를 사용한 번역, 발음, TMI 생성 (API 키 필요)',
            en: 'Translation, pronunciation, and TMI generation using Pollinations.ai (API Key Required)',
            ja: 'Pollinations.aiを使用した翻訳、発音、TMI生成（APIキー必要）',
            'zh-CN': '使用 Pollinations.ai 进行翻译、发音和 TMI 生成（需要 API 密钥）',
        },
        version: '1.0.0',
        apiKeyUrl: 'https://enter.pollinations.ai',
        // 지원 기능
        supports: {
            translate: true,    // 가사 번역/발음
            metadata: true,     // 메타데이터 번역
            tmi: true           // TMI 생성
        },
        models: [] // API에서 동적으로 로드
    };

    // API 기본 URL
    const BASE_URL = 'https://gen.pollinations.ai';

    /**
     * Pollinations.ai API에서 사용 가능한 모델 목록을 가져옴 (텍스트 생성용 모델만)
     */
    async function fetchAvailableModels() {
        try {
            const response = await fetch(`${BASE_URL}/v1/models`);

            if (!response.ok) {
                console.warn('[Pollinations Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();

            // 오디오 전용 모델 제외
            const excludePatterns = ['audio', 'midijourney'];

            const models = (data.data || [])
                .filter(m => {
                    if (!m.id) return false;
                    const id = m.id.toLowerCase();
                    // 제외 패턴 체크
                    for (const pattern of excludePatterns) {
                        if (id.includes(pattern)) return false;
                    }
                    return true;
                })
                .map(m => ({
                    id: m.id,
                    name: m.id,
                }))
                // 인기 모델 우선 정렬
                .sort((a, b) => {
                    const priority = ['openai', 'gemini', 'claude', 'deepseek', 'mistral', 'grok', 'qwen', 'perplexity'];
                    const aIdx = priority.findIndex(p => a.id.includes(p));
                    const bIdx = priority.findIndex(p => b.id.includes(p));
                    const aPri = aIdx === -1 ? 999 : aIdx;
                    const bPri = bIdx === -1 ? 999 : bIdx;
                    if (aPri !== bPri) return aPri - bPri;
                    return a.id.localeCompare(b.id);
                });

            // 첫 번째 모델을 기본값으로 설정
            if (models.length > 0) {
                models[0].default = true;
            }

            return models;
        } catch (e) {
            console.warn('[Pollinations Addon] Error fetching models:', e.message);
            return [];
        }
    }

    /**
     * 모델 목록 가져오기 (매번 API에서 로드)
     */
    async function getModels() {
        return await fetchAvailableModels();
    }

    // ============================================
    // Language Data
    // ============================================

    const LANGUAGE_DATA = {
        'ko': { name: 'Korean', native: '한국어', phoneticDesc: 'Korean Hangul pronunciation (e.g., こんにちは → 콘니치와)' },
        'en': { name: 'English', native: 'English', phoneticDesc: 'English romanization (e.g., こんにちは → konnichiwa)' },
        'zh-CN': { name: 'Simplified Chinese', native: '简体中文', phoneticDesc: 'Chinese characters for pronunciation' },
        'zh-TW': { name: 'Traditional Chinese', native: '繁體中文', phoneticDesc: 'Chinese characters for pronunciation' },
        'ja': { name: 'Japanese', native: '日本語', phoneticDesc: 'Japanese Katakana pronunciation' },
        'hi': { name: 'Hindi', native: 'हिन्दी', phoneticDesc: 'Hindi Devanagari pronunciation' },
        'es': { name: 'Spanish', native: 'Español', phoneticDesc: 'Spanish phonetic spelling' },
        'fr': { name: 'French', native: 'Français', phoneticDesc: 'French phonetic spelling' },
        'ar': { name: 'Arabic', native: 'العربية', phoneticDesc: 'Arabic script pronunciation' },
        'fa': { name: 'Persian', native: 'فارسی', phoneticDesc: 'Persian script pronunciation' },
        'de': { name: 'German', native: 'Deutsch', phoneticDesc: 'German phonetic spelling' },
        'ru': { name: 'Russian', native: 'Русский', phoneticDesc: 'Russian Cyrillic pronunciation' },
        'pt': { name: 'Portuguese', native: 'Português', phoneticDesc: 'Portuguese phonetic spelling' },
        'bn': { name: 'Bengali', native: 'বাংলা', phoneticDesc: 'Bengali script pronunciation' },
        'it': { name: 'Italian', native: 'Italiano', phoneticDesc: 'Italian phonetic spelling' },
        'th': { name: 'Thai', native: 'ไทย', phoneticDesc: 'Thai script pronunciation' },
        'vi': { name: 'Vietnamese', native: 'Tiếng Việt', phoneticDesc: 'Vietnamese phonetic spelling' },
        'id': { name: 'Indonesian', native: 'Bahasa Indonesia', phoneticDesc: 'Indonesian phonetic spelling' }
    };

    // ============================================
    // Helper Functions
    // ============================================

    function getLocalizedText(textObj, lang) {
        if (typeof textObj === 'string') return textObj;
        return textObj[lang] || textObj['en'] || Object.values(textObj)[0] || '';
    }

    function getSetting(key, defaultValue = null) {
        return window.AIAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        window.AIAddonManager?.setAddonSetting(ADDON_INFO.id, key, value);
    }

    function getApiKey() {
        // Pollinations.ai는 API 키가 선택적 (무료 사용 가능)
        return getSetting('api-key', '');
    }

    function getSelectedModel() {
        return getSetting('model', 'gemini-fast');
    }

    function getLangInfo(lang) {
        if (!lang) return LANGUAGE_DATA['en'];
        const shortLang = lang.split('-')[0].toLowerCase();
        return LANGUAGE_DATA[lang] || LANGUAGE_DATA[shortLang] || LANGUAGE_DATA['en'];
    }

    // ============================================
    // Prompt Builders (Plain Text Output - Simplified)
    // ============================================

    function buildTranslationPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;

        return `Translate these ${lineCount} lines of song lyrics to ${langInfo.name} (${langInfo.native}).

RULES:
- Output EXACTLY ${lineCount} lines, one translation per line
- Keep empty lines as empty
- Keep ♪ symbols and markers like [Chorus], (Yeah) as-is
- Do NOT add line numbers or prefixes
- Do NOT use JSON or code blocks
- Just output the translated lines, nothing else

INPUT:
${text}

OUTPUT (${lineCount} lines):`;
    }

    function buildPhoneticPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;
        const isEnglish = lang === 'en';
        const scriptInstruction = isEnglish
            ? 'Use Latin alphabet only (romanization).'
            : `Use ${langInfo.native} script.`;

        return `Convert these ${lineCount} lines of lyrics to pronunciation for ${langInfo.name} speakers.
${scriptInstruction}

RULES:
- Output EXACTLY ${lineCount} lines, one pronunciation per line
- Keep empty lines as empty
- Keep ♪ symbols and markers like [Chorus], (Yeah) as-is
- Do NOT add line numbers or prefixes
- Do NOT use JSON or code blocks
- Just output the pronunciations, nothing else

INPUT:
${text}

OUTPUT (${lineCount} lines):`;
    }

    function buildMetadataPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);

        return `Translate the song title and artist name to ${langInfo.name} (${langInfo.native}).

**Input**:
- Title: ${title}
- Artist: ${artist}

**Output valid JSON**:
{
  "translatedTitle": "translated title",
  "translatedArtist": "translated artist",
  "romanizedTitle": "romanized in Latin alphabet",
  "romanizedArtist": "romanized in Latin alphabet"
}`;
    }

    function buildTMIPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);

        return `You are a music knowledge expert. Generate interesting facts and trivia about the song "${title}" by "${artist}".

IMPORTANT: The output MUST be in ${langInfo.name} (${langInfo.native}).
Even if the song is English, the description and trivia MUST be written in ${langInfo.native}.

**Output conditions**:
1. Language: STRICTLY ${langInfo.name} (${langInfo.native})
2. Format: JSON

**Output JSON Structure**:
{
  "track": {
    "description": "2-3 sentence description in ${langInfo.native}",
    "trivia": [
      "Fact 1 in ${langInfo.native}",
      "Fact 2 in ${langInfo.native}",
      "Fact 3 in ${langInfo.native}"
    ],
    "sources": {
      "verified": [],
      "related": [],
      "other": []
    },
    "reliability": {
      "confidence": "medium",
      "has_verified_sources": false,
      "verified_source_count": 0,
      "related_source_count": 0,
      "total_source_count": 0
    }
  }
}

**Rules**:
1. Write in ${langInfo.native}
2. Include 3-5 interesting facts in the trivia array
3. Be accurate - if you're not sure about a fact, mark confidence as "low"
4. Do NOT use markdown code blocks`;
    }

    // ============================================
    // API Call Functions
    // ============================================

    /**
     * Call Pollinations.ai API and return raw text response
     */
    async function callPollinationsAPIRaw(prompt, maxRetries = 3) {
        const model = getSelectedModel();
        const apiKey = getApiKey();
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const endpoint = `${BASE_URL}/v1/chat/completions`;

                const headers = {
                    'Content-Type': 'application/json',
                };

                // API 키가 있으면 추가 (선택적)
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.3,
                        max_tokens: 16000
                    })
                });

                if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again later.');
                }

                if (!response.ok) {
                    // Try to parse error response for better error messages
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const errorData = await response.json();
                        if (errorData.error?.message) {
                            errorMessage = errorData.error.message;
                        } else if (errorData.message) {
                            errorMessage = errorData.message;
                        }
                    } catch (parseError) {
                        // Use default error message if parsing fails
                    }
                    throw new Error(`[Pollinations.ai] ${errorMessage}`);
                }

                const data = await response.json();
                const rawText = data.choices?.[0]?.message?.content || '';

                if (!rawText) {
                    throw new Error('[Pollinations.ai] Empty response from API');
                }

                return rawText;

            } catch (e) {
                lastError = e;
                console.warn(`[Pollinations Addon] Attempt ${attempt + 1} failed:`, e.message);

                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('[Pollinations.ai] All retries exhausted');
    }

    /**
     * Call Pollinations.ai API and parse JSON response (for metadata, TMI, etc.)
     */
    async function callPollinationsAPI(prompt, maxRetries = 3) {
        const rawText = await callPollinationsAPIRaw(prompt, maxRetries);
        return extractJSON(rawText);
    }

    /**
     * Parse plain text lines from API response
     */
    function parseTextLines(text, expectedLineCount) {
        // Remove markdown code blocks if present
        let cleaned = text.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '').trim();

        // Split by newlines
        const lines = cleaned.split('\n');

        // If line count matches, return as-is
        if (lines.length === expectedLineCount) {
            return lines;
        }

        // If we have more lines, try to find the correct block
        if (lines.length > expectedLineCount) {
            console.warn(`[Pollinations Addon] Got ${lines.length} lines, expected ${expectedLineCount}. Trimming...`);
            return lines.slice(-expectedLineCount);
        }

        // If we have fewer lines, pad with empty strings
        console.warn(`[Pollinations Addon] Got ${lines.length} lines, expected ${expectedLineCount}. Padding...`);
        while (lines.length < expectedLineCount) {
            lines.push('');
        }

        return lines;
    }

    function extractJSON(text) {
        // Remove markdown code blocks
        let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        // Try direct parse
        try {
            return JSON.parse(cleaned);
        } catch {
            // Find JSON object in text
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    throw new Error('Failed to parse JSON response');
                }
            }
            throw new Error('No valid JSON found in response');
        }
    }

    // ============================================
    // Addon Implementation
    // ============================================

    const PollinationsAddon = {
        ...ADDON_INFO,

        async init() {
            console.log(`[Pollinations Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 연결 테스트
         */
        async testConnection() {
            await callPollinationsAPIRaw('Reply with just "OK" if you receive this.');
        },

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback, useEffect } = React;

            return function PollinationsSettings() {
                const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                const [model, setModel] = useState(getSelectedModel());
                const [testStatus, setTestStatus] = useState('');
                const [availableModels, setAvailableModels] = useState([]);
                const [modelsLoading, setModelsLoading] = useState(false);

                // 모델 목록 로드
                const loadModels = useCallback(async () => {
                    setModelsLoading(true);
                    try {
                        const models = await getModels();
                        setAvailableModels(models);
                        // ADDON_INFO.models 업데이트
                        ADDON_INFO.models = models;
                    } catch (e) {
                        console.warn('[Pollinations Addon] Failed to load models:', e);
                        setAvailableModels([]);
                    } finally {
                        setModelsLoading(false);
                    }
                }, []);

                // 컴포넌트 마운트시 모델 목록 로드
                useEffect(() => {
                    loadModels();
                }, []);

                const handleApiKeyChange = useCallback((e) => {
                    setApiKey(e.target.value);
                    setSetting('api-key', e.target.value);
                }, []);

                const handleModelChange = useCallback((e) => {
                    setModel(e.target.value);
                    setSetting('model', e.target.value);
                }, []);

                const handleRefreshModels = useCallback(() => {
                    loadModels();
                }, [loadModels]);

                const handleTest = useCallback(async () => {
                    setTestStatus('Testing...');
                    try {
                        await callPollinationsAPIRaw('Reply with just "OK" if you receive this.');
                        setTestStatus('✓ Connection successful!');
                    } catch (e) {
                        setTestStatus(`✗ Error: ${e.message}`);
                    }
                }, []);



                // ... (existing code for models)

                // ... (existing code for test)

                return React.createElement('div', { className: 'ai-addon-settings pollinations-settings' },
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'API Key (Optional)'),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('input', {
                                type: 'password',
                                value: apiKey,
                                onChange: handleApiKeyChange,
                                placeholder: 'Optional - for premium features'
                            }),
                            React.createElement('button', {
                                onClick: () => window.open(ADDON_INFO.apiKeyUrl, '_blank'),
                                className: 'ai-addon-btn-secondary'
                            }, 'Get API Key')
                        ),
                        React.createElement('small', null, '🆓 Free to use without API key. API key unlocks higher rate limits.')
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Model'),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('select', {
                                value: model,
                                onChange: handleModelChange,
                                disabled: modelsLoading
                            },
                                modelsLoading
                                    ? React.createElement('option', { value: '' }, 'Loading models...')
                                    : availableModels.length > 0
                                        ? availableModels.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name))
                                        : React.createElement('option', { value: 'gemini-fast' }, 'gemini-fast')
                            ),
                            React.createElement('button', {
                                onClick: handleRefreshModels,
                                className: 'ai-addon-btn-secondary',
                                disabled: modelsLoading,
                                title: 'Refresh model list'
                            }, modelsLoading ? '...' : '↻')
                        ),
                        availableModels.length > 0 && React.createElement('small', null, `${availableModels.length} models available`)
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('button', { onClick: handleTest, className: 'ai-addon-btn-primary' }, 'Test Connection'),
                        testStatus && React.createElement('span', {
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    )
                );
            };
        },

        async translateLyrics({ text, lang, wantSmartPhonetic }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const expectedLineCount = text.split('\n').length;
            const prompt = wantSmartPhonetic
                ? buildPhoneticPrompt(text, lang)
                : buildTranslationPrompt(text, lang);

            // Get raw text response and parse lines
            const rawResponse = await callPollinationsAPIRaw(prompt);
            const lines = parseTextLines(rawResponse, expectedLineCount);

            // Return in the format expected by LyricsService
            if (wantSmartPhonetic) {
                return { phonetic: lines };
            } else {
                return { translation: lines };
            }
        },

        async translateMetadata({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildMetadataPrompt(title, artist, lang);
            const result = await callPollinationsAPI(prompt);

            // Normalize result to match expected format
            return {
                translated: {
                    title: result.translatedTitle || result.title || title,
                    artist: result.translatedArtist || result.artist || artist
                },
                romanized: {
                    title: result.romanizedTitle || title,
                    artist: result.romanizedArtist || artist
                }
            };
        },

        async generateTMI({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildTMIPrompt(title, artist, lang);
            return await callPollinationsAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(PollinationsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log('[Pollinations Addon] Module loaded');
})();
