/**
 * Perplexity AI Addon for ivLyrics
 * Perplexity AI를 사용한 번역, 발음, TMI 생성
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
        id: 'perplexity',
        name: 'Perplexity',
        author: 'ivLis STUDIO',
        description: {
            ko: 'Perplexity AI를 사용한 번역, 발음, TMI 생성 (실시간 웹 검색 지원)',
            en: 'Translation, pronunciation, and TMI generation using Perplexity AI (with real-time web search)',
            ja: 'Perplexity AIを使用した翻訳、発音、TMI生成（リアルタイムウェブ検索対応）',
            'zh-CN': '使用 Perplexity AI 进行翻译、发音和 TMI 生成（支持实时网络搜索）',
        },
        version: '1.0.0',
        apiKeyUrl: 'https://www.perplexity.ai/settings/api',
        supports: {
            translate: true,
            metadata: true,
            tmi: true
        },
        models: [
            { id: 'sonar-pro', name: 'Sonar Pro (Best)', default: true },
            { id: 'sonar', name: 'Sonar' },
            { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
            { id: 'sonar-reasoning', name: 'Sonar Reasoning' }
        ]
    };

    const BASE_URL = 'https://api.perplexity.ai';

    // ============================================
    // Language Data
    // ============================================

    const LANGUAGE_DATA = {
        'ko': { name: 'Korean', native: '한국어' },
        'en': { name: 'English', native: 'English' },
        'zh-CN': { name: 'Simplified Chinese', native: '简体中文' },
        'zh-TW': { name: 'Traditional Chinese', native: '繁體中文' },
        'ja': { name: 'Japanese', native: '日本語' },
        'hi': { name: 'Hindi', native: 'हिन्दी' },
        'es': { name: 'Spanish', native: 'Español' },
        'fr': { name: 'French', native: 'Français' },
        'ar': { name: 'Arabic', native: 'العربية' },
        'fa': { name: 'Persian', native: 'فارسی' },
        'de': { name: 'German', native: 'Deutsch' },
        'ru': { name: 'Russian', native: 'Русский' },
        'pt': { name: 'Portuguese', native: 'Português' },
        'bn': { name: 'Bengali', native: 'বাংলা' },
        'it': { name: 'Italian', native: 'Italiano' },
        'th': { name: 'Thai', native: 'ไทย' },
        'vi': { name: 'Vietnamese', native: 'Tiếng Việt' },
        'id': { name: 'Indonesian', native: 'Bahasa Indonesia' }
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

    function getSelectedModel() {
        return getSetting('model', 'sonar-pro');
    }

    function getLangInfo(lang) {
        return LANGUAGE_DATA[lang] || LANGUAGE_DATA['en'];
    }

    // ============================================
    // Prompt Builders
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

    async function callPerplexityAPIRaw(prompt, maxRetries = 3) {
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error('[Perplexity] API key is required. Please configure your API key in settings.');
        }

        const model = getSelectedModel();
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(`${BASE_URL}/chat/completions`, {
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
                    throw new Error('[Perplexity] Rate limit exceeded. Please try again later.');
                }

                if (response.status === 401 || response.status === 403) {
                    let errorMessage = 'Invalid API key or permission denied.';
                    try {
                        const errorData = await response.json();
                        if (errorData.error?.message) {
                            errorMessage = errorData.error.message;
                        }
                    } catch (parseError) { }
                    throw new Error(`[Perplexity] ${errorMessage}`);
                }

                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const errorData = await response.json();
                        if (errorData.error?.message) {
                            errorMessage = errorData.error.message;
                        }
                    } catch (parseError) { }
                    throw new Error(`[Perplexity] ${errorMessage}`);
                }

                const data = await response.json();
                const rawText = data.choices?.[0]?.message?.content || '';

                if (!rawText) {
                    throw new Error('[Perplexity] Empty response from API');
                }

                return rawText;

            } catch (e) {
                lastError = e;
                console.warn(`[Perplexity Addon] Attempt ${attempt + 1} failed:`, e.message);

                if (e.message.includes('Invalid API key') || e.message.includes('permission denied')) {
                    throw e;
                }

                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('[Perplexity] All retries exhausted');
    }

    async function callPerplexityAPI(prompt, maxRetries = 3) {
        const rawText = await callPerplexityAPIRaw(prompt, maxRetries);
        return extractJSON(rawText);
    }

    function parseTextLines(text, expectedLineCount) {
        let cleaned = text.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '').trim();
        const lines = cleaned.split('\n');

        if (lines.length === expectedLineCount) {
            return lines;
        }

        if (lines.length > expectedLineCount) {
            return lines.slice(-expectedLineCount);
        }

        while (lines.length < expectedLineCount) {
            lines.push('');
        }

        return lines;
    }

    function extractJSON(text) {
        let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch {
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch { }
            }
        }
        return null;
    }

    // ============================================
    // Main Addon Object
    // ============================================

    const PerplexityAddon = {
        ...ADDON_INFO,

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState } = React;

            return function PerplexitySettings() {
                const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                const [selectedModel, setSelectedModel] = useState(getSetting('model', 'sonar-pro'));
                const [testStatus, setTestStatus] = useState('');

                const handleApiKeyChange = (e) => {
                    const val = e.target.value;
                    setApiKey(val);
                    setSetting('api-key', val);
                };

                const handleModelChange = (e) => {
                    const val = e.target.value;
                    setSelectedModel(val);
                    setSetting('model', val);
                };

                const handleTest = async () => {
                    setTestStatus('Testing...');
                    try {
                        const result = await callPerplexityAPIRaw('Say "Hello" in one word.');
                        setTestStatus(result ? '✓ Connection successful' : '✗ Empty response');
                    } catch (e) {
                        setTestStatus(`✗ ${e.message}`);
                    }
                };

                return React.createElement('div', { className: 'ai-addon-settings' },
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'API Key'),
                        React.createElement('input', {
                            type: 'password',
                            value: apiKey,
                            onChange: handleApiKeyChange,
                            placeholder: 'pplx-...'
                        }),
                        React.createElement('small', null,
                            React.createElement('a', { href: ADDON_INFO.apiKeyUrl, target: '_blank' }, 'Get API Key')
                        )
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Model'),
                        React.createElement('select', {
                            value: selectedModel,
                            onChange: handleModelChange
                        },
                            ADDON_INFO.models.map(m => React.createElement('option', { key: m.id, value: m.id }, m.name))
                        ),
                        React.createElement('small', null, 'Sonar models include real-time web search')
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

            const rawResponse = await callPerplexityAPIRaw(prompt);
            const lines = parseTextLines(rawResponse, expectedLineCount);

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
            const result = await callPerplexityAPI(prompt);

            return {
                translated: {
                    title: result?.translatedTitle || result?.title || title,
                    artist: result?.translatedArtist || result?.artist || artist
                },
                romanized: {
                    title: result?.romanizedTitle || title,
                    artist: result?.romanizedArtist || artist
                }
            };
        },

        async generateTMI({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildTMIPrompt(title, artist, lang);
            return await callPerplexityAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(PerplexityAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log('[Perplexity Addon] Module loaded');
})();
