/**
 * Gemini AI Addon (Reference for AI Provider Addon)
 * 
 * [English]
 * This file serves as a reference for creating an AI Provider Addon using Google Gemini.
 * It follows the same structure as the ChatGPT addon but adapts the API calls for Gemini.
 * 
 * [Korean]
 * 이 파일은 Google Gemini를 사용하는 AI 제공자 애드온을 만들기 위한 레퍼런스입니다.
 * ChatGPT 애드온과 동일한 구조를 따르지만 API 호출 부분이 Gemini에 맞춰져 있습니다.
 * 
 * @id gemini
 * @version 1.0.0
 */

(() => {
    'use strict';

    // ============================================
    // 1. Addon Metadata
    // ============================================
    const ADDON_INFO = {
        id: 'gemini',
        name: 'Google Gemini',
        author: 'ivLis STUDIO',
        description: {
            ko: 'Google Gemini AI를 사용한 번역, 발음, TMI 생성',
            en: 'Translation, pronunciation, and TMI generation using Google Gemini AI'
        },
        version: '1.0.0',
        apiKeyUrl: 'https://aistudio.google.com/apikey',
        models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', default: true },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
        ]
    };

    const LANGUAGE_DATA = {
        'ko': { name: 'Korean', native: '한국어' },
        'en': { name: 'English', native: 'English' },
        // ...
    };

    // ============================================
    // 2. Helper Functions
    // ============================================

    function getSetting(key, defaultValue = null) {
        return window.AIAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        window.AIAddonManager?.setAddonSetting(ADDON_INFO.id, key, value);
    }

    function getApiKeys() {
        const raw = getSetting('api-keys', '');
        // [English] Handle both single key string and JSON array of keys
        try {
            if (raw.trim().startsWith('[')) return JSON.parse(raw);
            return [raw.trim()];
        } catch {
            return [raw.trim()];
        }
    }

    function getSelectedModel() {
        return getSetting('model', ADDON_INFO.models.find(m => m.default)?.id);
    }

    function getLangInfo(lang) {
        return LANGUAGE_DATA[lang] || LANGUAGE_DATA['en'];
    }

    // --- Prompts ---
    // (Similar to ChatGPT prompts, but optimized for Gemini if needed)

    function buildTranslationPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;
        return `Translate these ${lineCount} lines to ${langInfo.name}. 
Output exactly ${lineCount} lines. No extra text.
Input:
${text}
Output:`;
    }

    function buildMetadataPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);
        return `Translate song metadata to ${langInfo.name}.
Input: ${title} / ${artist}
Output JSON: { "translatedTitle": "...", "translatedArtist": "...", "romanizedTitle": "...", "romanizedArtist": "..." }
No markdown.`;
    }

    function buildTMIPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);
        return `Generate trivia for "${title}" by "${artist}" in ${langInfo.native}.
Output JSON: { "track": { "description": "...", "trivia": ["..."], "sources": {...}, "reliability": {...} } }`;
    }


    // --- API Call Implementation ---

    async function callGeminiAPIRaw(prompt, maxRetries = 3) {
        const apiKeys = getApiKeys().filter(k => k);
        if (apiKeys.length === 0) throw new Error('No API Key');

        const model = getSelectedModel();

        // [English] Simple rotation through available keys
        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            } catch (e) {
                console.warn(`Key ${i} failed`, e);
                // Continue to next key if available
            }
        }
        throw new Error('All keys failed');
    }

    async function callGeminiAPI(prompt) {
        const raw = await callGeminiAPIRaw(prompt);
        try {
            return JSON.parse(raw.replace(/```json\s*|```/g, '').trim());
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            throw new Error('Failed to parse JSON');
        }
    }

    function parseTextLines(text, expectedLineCount) {
        let lines = text.replace(/```\s*/g, '').trim().split('\n');
        // Simple logic
        if (lines.length > expectedLineCount) lines = lines.slice(-expectedLineCount);
        while (lines.length < expectedLineCount) lines.push('');
        return lines;
    }

    // ============================================
    // 3. Addon Implementation
    // ============================================
    const GeminiAddon = {
        ...ADDON_INFO,

        async init() {
            console.log(`[Gemini Addon] Initialized`);
        },

        async testConnection() {
            await callGeminiAPIRaw('Reply "OK"');
        },

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState } = React;

            return function GeminiSettings() {
                const [apiKeys, setApiKeys] = useState(getSetting('api-keys', ''));
                const [model, setModel] = useState(getSelectedModel());
                const [status, setStatus] = useState('');

                const handleSave = (k, v) => {
                    if (k === 'api-keys') setApiKeys(v);
                    if (k === 'model') setModel(v);
                    setSetting(k, v);
                };

                const handleTest = async () => {
                    setStatus('Testing...');
                    try {
                        await callGeminiAPIRaw('Hi');
                        setStatus('Success');
                    } catch (e) {
                        setStatus(e.message);
                    }
                };

                return React.createElement('div', { className: 'ai-addon-settings' },
                    React.createElement('h3', null, 'Gemini Settings'),
                    React.createElement('div', { className: 'setting-row' },
                        React.createElement('label', null, 'API Keys (One per line or JSON array)'),
                        React.createElement('textarea', {
                            value: apiKeys,
                            onChange: (e) => handleSave('api-keys', e.target.value),
                            rows: 3
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
                    React.createElement('span', { style: { marginLeft: 10 } }, status)
                );
            };
        },

        async translateLyrics(params) {
            const { text, lang, wantSmartPhonetic } = params;
            // Similar logic to ChatGPT
            const prompt = wantSmartPhonetic
                ? `Phonetic conversion to ${lang}:\n${text}`
                : buildTranslationPrompt(text, lang);

            const raw = await callGeminiAPIRaw(prompt);
            const lines = parseTextLines(raw, text.split('\n').length);

            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async translateMetadata(params) {
            const prompt = buildMetadataPrompt(params.title, params.artist, params.lang);
            const res = await callGeminiAPI(prompt);
            return {
                translated: { title: res.translatedTitle, artist: res.translatedArtist },
                romanized: { title: res.romanizedTitle, artist: res.romanizedArtist }
            };
        },

        async generateTMI(params) {
            const prompt = buildTMIPrompt(params.title, params.artist, params.lang);
            return await callGeminiAPI(prompt);
        }
    };

    // ============================================
    // 4. Registration
    // ============================================
    const registerAddon = () => {
        if (window.AIAddonManager) window.AIAddonManager.register(GeminiAddon);
        else setTimeout(registerAddon, 100);
    };

    registerAddon();
    console.log('[Gemini Addon] Module loaded');
})();
