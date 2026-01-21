/**
 * ChatGPT AI Addon for ivLyrics
 * OpenAI ChatGPT를 사용한 번역, 발음, TMI 생성
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
        id: 'chatgpt',
        name: 'OpenAI ChatGPT',
        author: 'ivLis STUDIO',
        description: {
            ko: 'OpenAI ChatGPT를 사용한 번역, 발음, TMI 생성 (OpenAI 호환 API 지원)',
            en: 'Translation, pronunciation, and TMI generation using OpenAI ChatGPT (supports OpenAI-compatible APIs)',
            ja: 'OpenAI ChatGPTを使用した翻訳、発音、TMI生成（OpenAI互換API対応）',
            'zh-CN': '使用 OpenAI ChatGPT 进行翻译、发音和 TMI 生成（支持 OpenAI 兼容 API）',
        },
        version: '1.0.0',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', default: true },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ]
    };

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
        return getSetting('api-key', '');
    }

    function getBaseUrl() {
        return getSetting('base-url', 'https://api.openai.com/v1') || 'https://api.openai.com/v1';
    }

    function getSelectedModel() {
        return getSetting('model', ADDON_INFO.models.find(m => m.default)?.id || ADDON_INFO.models[0]?.id);
    }

    function getLangInfo(lang) {
        return LANGUAGE_DATA[lang] || LANGUAGE_DATA['en'];
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

        return `Generate interesting facts about the song "${title}" by "${artist}".

**Output language**: ${langInfo.name} (${langInfo.native})

**Output valid JSON**:
{
  "track": {
    "description": "2-3 sentence description",
    "trivia": ["fact 1", "fact 2", "fact 3"],
    "sources": {"verified": [], "related": [], "other": []},
    "reliability": {"confidence": "medium", "has_verified_sources": false, "verified_source_count": 0, "related_source_count": 0, "total_source_count": 0}
  }
}

Write in ${langInfo.native}. Include 3-5 interesting facts.`;
    }

    // ============================================
    // API Call Functions
    // ============================================

    /**
     * Call ChatGPT API and return raw text response
     */
    async function callChatGPTAPIRaw(prompt, maxRetries = 3) {
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error('API key is required. Please configure your API key in settings.');
        }

        const baseUrl = getBaseUrl();
        const model = getSelectedModel();
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
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

                if (response.status === 401 || response.status === 403) {
                    throw new Error('Invalid API key or permission denied.');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const rawText = data.choices?.[0]?.message?.content || '';

                if (!rawText) {
                    throw new Error('Empty response from API');
                }

                return rawText;

            } catch (e) {
                lastError = e;
                console.warn(`[ChatGPT Addon] Attempt ${attempt + 1} failed:`, e.message);

                // Don't retry on auth errors
                if (e.message.includes('Invalid API key') || e.message.includes('permission denied')) {
                    throw e;
                }

                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('All retries exhausted');
    }

    /**
     * Call ChatGPT API and parse JSON response (for metadata, TMI, etc.)
     */
    async function callChatGPTAPI(prompt, maxRetries = 3) {
        const rawText = await callChatGPTAPIRaw(prompt, maxRetries);
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
            console.warn(`[ChatGPT Addon] Got ${lines.length} lines, expected ${expectedLineCount}. Trimming...`);
            return lines.slice(-expectedLineCount);
        }

        // If we have fewer lines, pad with empty strings
        console.warn(`[ChatGPT Addon] Got ${lines.length} lines, expected ${expectedLineCount}. Padding...`);
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

    const ChatGPTAddon = {
        ...ADDON_INFO,

        async init() {
            console.log(`[ChatGPT Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 연결 테스트
         */
        async testConnection() {
            await callChatGPTAPIRaw('Reply with just "OK" if you receive this.');
        },

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback } = React;

            // AddonUI 사용 가능 여부 확인
            if (window.AddonUI) {
                const UI = window.AddonUI;

                return function ChatGPTSettingsUI() {
                    const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                    const [baseUrl, setBaseUrl] = useState(getSetting('base-url', 'https://api.openai.com/v1'));
                    const [model, setModel] = useState(getSelectedModel());
                    const [customModel, setCustomModel] = useState(getSetting('custom-model', ''));
                    const [testStatus, setTestStatus] = useState('');
                    const [testing, setTesting] = useState(false);

                    const handleApiKeyChange = useCallback((value) => {
                        setApiKey(value);
                        setSetting('api-key', value);
                    }, []);

                    const handleBaseUrlChange = useCallback((value) => {
                        setBaseUrl(value);
                        setSetting('base-url', value);
                    }, []);

                    const handleModelChange = useCallback((value) => {
                        setModel(value);
                        setSetting('model', value);
                    }, []);

                    const handleCustomModelChange = useCallback((value) => {
                        setCustomModel(value);
                        setSetting('custom-model', value);
                        if (value) {
                            setSetting('model', value);
                            setModel(value);
                        }
                    }, []);

                    const handleTest = useCallback(async () => {
                        setTesting(true);
                        setTestStatus('');
                        try {
                            await callChatGPTAPIRaw('Reply with just "OK" if you receive this.');
                            setTestStatus('✓ Connection successful!');
                        } catch (e) {
                            setTestStatus(`✗ Error: ${e.message}`);
                        } finally {
                            setTesting(false);
                        }
                    }, []);

                    // 모델 옵션 (Custom 포함)
                    const modelOptions = [...ADDON_INFO.models, { id: '', name: 'Custom...' }];
                    const isCustomModel = !ADDON_INFO.models.find(m => m.id === model);

                    return React.createElement(UI.SettingsContainer, { addonId: 'chatgpt' },
                        // Header
                        React.createElement(UI.AddonHeader, {
                            name: ADDON_INFO.name,
                            version: ADDON_INFO.version,
                            description: getLocalizedText(ADDON_INFO.description, Spicetify.Locale?.getLocale()?.split('-')[0] || 'en')
                        }),

                        // API Key
                        React.createElement(UI.PasswordInput, {
                            label: 'API Key',
                            value: apiKey,
                            onChange: handleApiKeyChange,
                            placeholder: 'sk-...',
                            externalUrl: ADDON_INFO.apiKeyUrl,
                            externalLabel: 'Get API Key'
                        }),

                        // Base URL
                        React.createElement(UI.TextInput, {
                            label: 'Base URL',
                            value: baseUrl,
                            onChange: handleBaseUrlChange,
                            placeholder: 'https://api.openai.com/v1',
                            description: 'Change this to use OpenAI-compatible APIs (e.g., Azure, local models)'
                        }),

                        // Model Selection
                        React.createElement(UI.Select, {
                            label: 'Model',
                            value: isCustomModel ? '' : model,
                            onChange: handleModelChange,
                            options: modelOptions
                        }),

                        // Custom Model Input (조건부)
                        (isCustomModel || customModel) && React.createElement(UI.TextInput, {
                            label: 'Custom Model ID',
                            value: customModel,
                            onChange: handleCustomModelChange,
                            placeholder: 'e.g., claude-3-opus'
                        }),

                        // Test Button
                        React.createElement('div', { className: 'addon-ui-test-section' },
                            React.createElement(UI.Button, {
                                label: 'Test Connection',
                                onClick: handleTest,
                                primary: true,
                                loading: testing
                            }),
                            testStatus && React.createElement('span', {
                                className: `addon-ui-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                            }, testStatus)
                        )
                    );
                };
            }

            // Fallback: 기존 방식
            return function ChatGPTSettings() {
                const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                const [baseUrl, setBaseUrl] = useState(getSetting('base-url', 'https://api.openai.com/v1'));
                const [model, setModel] = useState(getSelectedModel());
                const [customModel, setCustomModel] = useState(getSetting('custom-model', ''));
                const [testStatus, setTestStatus] = useState('');

                const handleApiKeyChange = useCallback((e) => {
                    setApiKey(e.target.value);
                    setSetting('api-key', e.target.value);
                }, []);

                const handleBaseUrlChange = useCallback((e) => {
                    setBaseUrl(e.target.value);
                    setSetting('base-url', e.target.value);
                }, []);

                const handleModelChange = useCallback((e) => {
                    setModel(e.target.value);
                    setSetting('model', e.target.value);
                }, []);

                const handleCustomModelChange = useCallback((e) => {
                    const value = e.target.value;
                    setCustomModel(value);
                    setSetting('custom-model', value);
                    if (value) {
                        setSetting('model', value);
                        setModel(value);
                    }
                }, []);

                const handleTest = useCallback(async () => {
                    setTestStatus('Testing...');
                    try {
                        await callChatGPTAPIRaw('Reply with just "OK" if you receive this.');
                        setTestStatus('✓ Connection successful!');
                    } catch (e) {
                        setTestStatus(`✗ Error: ${e.message}`);
                    }
                }, []);

                return React.createElement('div', { className: 'ai-addon-settings chatgpt-settings' },
                    React.createElement('div', { className: 'ai-addon-header' },
                        React.createElement('h3', null, ADDON_INFO.name),
                        React.createElement('span', { className: 'ai-addon-version' }, `v${ADDON_INFO.version}`)
                    ),
                    React.createElement('p', { className: 'ai-addon-description' },
                        getLocalizedText(ADDON_INFO.description, Spicetify.Locale?.getLocale()?.split('-')[0] || 'en')
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'API Key'),
                        React.createElement('div', { className: 'ai-addon-input-group' },
                            React.createElement('input', { type: 'password', value: apiKey, onChange: handleApiKeyChange, placeholder: 'sk-...' }),
                            React.createElement('button', { onClick: () => window.open(ADDON_INFO.apiKeyUrl, '_blank'), className: 'ai-addon-btn-secondary' }, 'Get API Key')
                        )
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Base URL'),
                        React.createElement('input', { type: 'text', value: baseUrl, onChange: handleBaseUrlChange, placeholder: 'https://api.openai.com/v1' }),
                        React.createElement('small', null, 'Change this to use OpenAI-compatible APIs')
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Model'),
                        React.createElement('select', { value: ADDON_INFO.models.find(m => m.id === model) ? model : '', onChange: handleModelChange },
                            ADDON_INFO.models.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name)),
                            React.createElement('option', { value: '' }, 'Custom...')
                        )
                    ),
                    (!ADDON_INFO.models.find(m => m.id === model) || customModel) &&
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Custom Model ID'),
                        React.createElement('input', { type: 'text', value: customModel, onChange: handleCustomModelChange, placeholder: 'e.g., claude-3-opus' })
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
            const rawResponse = await callChatGPTAPIRaw(prompt);
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
            const result = await callChatGPTAPI(prompt);

            // Normalize result to match expected format in FullscreenOverlay.js
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
            return await callChatGPTAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(ChatGPTAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log('[ChatGPT Addon] Module loaded');
})();
