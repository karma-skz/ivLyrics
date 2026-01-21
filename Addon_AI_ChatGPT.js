/**
 * ChatGPT AI Addon (Reference for AI Provider Addon)
 * 
 * [English]
 * This file serves as a reference for creating an AI Provider Addon.
 * AI Addons are used for three main features:
 * 1. Translation (translateLyrics): Translate lyrics line-by-line.
 * 2. Metadata Translation (translateMetadata): Translate/Romanize song title and artist.
 * 3. TMI Generation (generateTMI): Generate interesting facts about the song.
 * 
 * [Korean]
 * 이 파일은 AI 제공자(AI Provider) 애드온을 만들기 위한 레퍼런스입니다.
 * AI 애드온은 크게 세 가지 기능에 사용됩니다:
 * 1. 번역 (translateLyrics): 가사를 줄 단위로 번역.
 * 2. 메타데이터 번역 (translateMetadata): 노래 제목과 아티스트명을 번역/로마자 표기.
 * 3. TMI 생성 (generateTMI): 노래에 대한 흥미로운 사실 생성.
 * 
 * @id chatgpt
 * @version 1.0.0
 */

(() => {
    'use strict';

    // ============================================
    // 1. Addon Metadata
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
            { id: 'gpt-5.2-2025-12-11', name: 'GPT-5.2', default: true },
            { id: 'gpt-5-mini-2025-08-07', name: 'GPT-5 Mini' },
            { id: 'gpt-5-nano-2025-08-07', name: 'GPT-5 Nano' }
        ]
    };

    // [English] Map language codes to detailed info used in prompts
    // [Korean] 프롬프트에 사용될 언어 코드와 상세 정보 매핑
    const LANGUAGE_DATA = {
        'ko': { name: 'Korean', native: '한국어', phoneticDesc: 'Korean Hangul pronunciation' },
        'en': { name: 'English', native: 'English', phoneticDesc: 'English romanization' },
        'ja': { name: 'Japanese', native: '日本語', phoneticDesc: 'Japanese Katakana pronunciation' },
        'zh-CN': { name: 'Simplified Chinese', native: '简体中文', phoneticDesc: 'Chinese characters' },
        // ... add more languages as needed
    };

    // ============================================
    // 2. Helper Functions (Prompts & API)
    // ============================================

    // [English] Helpers for accessing settings via AIAddonManager
    // [Korean] AIAddonManager를 통해 설정에 접근하기 위한 헬퍼들
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

    // --- Prompt Builders ---

    function buildTranslationPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;
        return `Translate these ${lineCount} lines of song lyrics to ${langInfo.name} (${langInfo.native}).
RULES:
- Output EXACTLY ${lineCount} lines, one translation per line
- Keep empty lines as empty
- Keep ♪ symbols and markers like [Chorus] as-is
- Do NOT add line numbers
- Do NOT use JSON or code blocks
INPUT:
${text}
OUTPUT:`;
    }

    function buildMetadataPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);
        return `Translate song metadata to ${langInfo.name} (${langInfo.native}).
Input: Title: ${title}, Artist: ${artist}
Output valid JSON:
{
  "translatedTitle": "translated title",
  "translatedArtist": "translated artist",
  "romanizedTitle": "romanized title",
  "romanizedArtist": "romanized artist"
}`;
    }

    function buildTMIPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);
        return `Generate facts about song "${title}" by "${artist}" in ${langInfo.native}.
Output valid JSON:
{
  "track": {
    "description": "Short description",
    "trivia": ["fact 1", "fact 2", "fact 3"],
    "sources": {"verified": [], "related": [], "other": []},
    "reliability": {"confidence": "medium"}
  }
}`;
    }

    // --- API Call Implementation ---

    async function callChatGPTAPIRaw(prompt, maxRetries = 3) {
        const apiKey = getApiKey();
        if (!apiKey) throw new Error('API key is required.');
        const baseUrl = getBaseUrl();
        const model = getSelectedModel();

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
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                return data.choices?.[0]?.message?.content || '';

            } catch (e) {
                if (attempt === maxRetries - 1) throw e;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async function callChatGPTAPI(prompt) {
        const raw = await callChatGPTAPIRaw(prompt);
        // [English] Simple JSON extraction logic
        try {
            return JSON.parse(raw.replace(/```json\s*|```/g, '').trim());
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            throw new Error('Failed to parse JSON response');
        }
    }

    function parseTextLines(text, expectedLineCount) {
        // [English] Clean up result and ensure line count matches
        let lines = text.replace(/```\s*/g, '').trim().split('\n');
        // Simple logic to match line count:
        if (lines.length > expectedLineCount) lines = lines.slice(-expectedLineCount);
        while (lines.length < expectedLineCount) lines.push('');
        return lines;
    }

    // ============================================
    // 3. Addon Implementation
    // ============================================
    const ChatGPTAddon = {
        ...ADDON_INFO,

        async init() {
            console.log(`[ChatGPT Addon] Initialized (v${ADDON_INFO.version})`);
        },

        async testConnection() {
            await callChatGPTAPIRaw('Reply with "OK".');
        },

        // [English] Settings UI Component
        // [Korean] 설정 UI 컴포넌트
        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback } = React;

            return function ChatGPTSettings() {
                const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                const [baseUrl, setBaseUrl] = useState(getSetting('base-url', 'https://api.openai.com/v1'));
                const [model, setModel] = useState(getSelectedModel());
                const [testStatus, setTestStatus] = useState('');

                const handleSave = (key, val) => {
                    if (key === 'api-key') setApiKey(val);
                    if (key === 'base-url') setBaseUrl(val);
                    if (key === 'model') setModel(val);
                    setSetting(key, val);
                };

                const handleTest = useCallback(async () => {
                    setTestStatus('Testing...');
                    try {
                        await callChatGPTAPIRaw('Reply "OK"');
                        setTestStatus('Success!');
                    } catch (e) {
                        setTestStatus(`Error: ${e.message}`);
                    }
                }, []);

                return React.createElement('div', { className: 'ai-addon-settings' },
                    React.createElement('h3', null, 'ChatGPT Settings'),
                    React.createElement('div', { className: 'setting-row' },
                        React.createElement('label', null, 'API Key'),
                        React.createElement('input', {
                            type: 'password',
                            value: apiKey,
                            onChange: (e) => handleSave('api-key', e.target.value)
                        })
                    ),
                    React.createElement('div', { className: 'setting-row' },
                        React.createElement('label', null, 'Model'),
                        React.createElement('select', {
                            value: model,
                            onChange: (e) => handleSave('model', e.target.value)
                        }, ADDON_INFO.models.map(m =>
                            React.createElement('option', { key: m.id, value: m.id }, m.name)
                        ))
                    ),
                    React.createElement('button', { onClick: handleTest }, 'Test Connection'),
                    React.createElement('div', null, testStatus)
                );
            };
        },

        // --- Core Features ---

        /**
         * [English] Translate lyrics
         * [Korean] 가사 번역
         */
        async translateLyrics({ text, lang, wantSmartPhonetic }) {
            if (!text?.trim()) throw new Error('No text');
            const expectedLineCount = text.split('\n').length;

            // [English] Build prompt differently for translation vs phonetic
            const prompt = wantSmartPhonetic
                ? `Convert to phonetic (romanized/script) for ${lang}. Input:\n${text}`
                : buildTranslationPrompt(text, lang);

            const rawResponse = await callChatGPTAPIRaw(prompt);
            const lines = parseTextLines(rawResponse, expectedLineCount);

            if (wantSmartPhonetic) return { phonetic: lines };
            return { translation: lines };
        },

        /**
         * [English] Translate metadata (Title/Artist)
         * [Korean] 메타데이터 번역 (제목/아티스트)
         */
        async translateMetadata({ title, artist, lang }) {
            const prompt = buildMetadataPrompt(title, artist, lang);
            const result = await callChatGPTAPI(prompt);
            return {
                translated: {
                    title: result.translatedTitle || title,
                    artist: result.translatedArtist || artist
                },
                romanized: {
                    title: result.romanizedTitle || title,
                    artist: result.romanizedArtist || artist
                }
            };
        },

        /**
         * [English] Generate TMI (Trivia)
         * [Korean] TMI (트리비아) 생성
         */
        async generateTMI({ title, artist, lang }) {
            const prompt = buildTMIPrompt(title, artist, lang);
            return await callChatGPTAPI(prompt);
        }
    };

    // ============================================
    // 4. Registration
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
