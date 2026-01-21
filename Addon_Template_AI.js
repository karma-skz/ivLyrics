/**
 * [YOUR_NAME] AI Addon - Template
 * [설명을 여기에 작성하세요]
 *
 * @addon-type ai
 * @id [your-addon-id]
 * @name [Your Addon Name]
 * @version 1.0.0
 * @author [Your Name]
 *
 * ============================================
 * AI Addon 개발 가이드
 * ============================================
 *
 * 필수 필드:
 * - id: string (고유 ID, 영문 소문자 권장)
 * - name: string (표시 이름)
 * - author: string (제작자)
 * - description: string | { en: string, ko: string, ... } (설명)
 * - version: string (버전)
 *
 * 필수 메서드:
 * - getSettingsUI(): React.Component (설정 UI)
 *
 * 선택 메서드 (기능별로 구현):
 * - translateLyrics(params): Promise<Object> (가사 번역/발음)
 * - translateMetadata(params): Promise<Object> (메타데이터 번역)
 * - generateTMI(params): Promise<Object> (TMI 생성)
 * - init(): Promise<void> (초기화)
 * - testConnection(): Promise<void> (연결 테스트 - SettingsUIBuilder용)
 *
 * translateLyrics params:
 * {
 *   trackId: string,         // 트랙 ID
 *   artist: string,          // 아티스트
 *   title: string,           // 곡 제목
 *   text: string,            // 번역할 가사 텍스트 (\n으로 줄 구분)
 *   lang: string,            // 대상 언어 코드 (예: 'ko', 'en', 'ja')
 *   wantSmartPhonetic: boolean  // true면 발음, false면 번역
 * }
 *
 * translateLyrics 반환 형식:
 * - 번역: { translation: string[] }     // 번역된 줄들의 배열
 * - 발음: { phonetic: string[] } // 발음 줄들의 배열
 *
 * translateMetadata params:
 * { trackId, title, artist, lang }
 *
 * translateMetadata 반환 형식:
 * {
 *   translatedTitle: string,
 *   translatedArtist: string,
 *   romanizedTitle: string,
 *   romanizedArtist: string
 * }
 *
 * generateTMI params:
 * { trackId, title, artist, lang }
 *
 * generateTMI 반환 형식:
 * {
 *   track: {
 *     description: string,
 *     trivia: string[],
 *     sources: { verified: [], related: [], other: [] },
 *     reliability: { confidence: string, ... }
 *   }
 * }
 */

(() => {
    'use strict';

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'your-ai-addon-id',                  // TODO: 고유 ID로 변경
        name: 'Your AI Addon Name',              // TODO: 표시 이름으로 변경
        author: 'Your Name',                     // TODO: 제작자 이름으로 변경
        version: '1.0.0',
        description: {
            en: 'AI-powered translation and TMI generation',    // TODO: 영어 설명
            ko: 'AI 기반 번역 및 TMI 생성',                       // TODO: 한국어 설명
            ja: 'AI による翻訳と TMI 生成'                        // TODO: 일본어 설명
        },
        // API 키 발급 URL (SettingsUI에서 사용)
        apiKeyUrl: 'https://example.com/api-keys',

        // 사용 가능한 모델 목록
        models: [
            { id: 'model-fast', name: 'Fast Model', default: true },
            { id: 'model-quality', name: 'Quality Model' },
            { id: 'model-balanced', name: 'Balanced Model' }
        ]
    };

    // ============================================
    // Language Data (공통)
    // ============================================

    const LANGUAGE_DATA = {
        'ko': { name: 'Korean', native: '한국어', phoneticDesc: 'Korean Hangul pronunciation' },
        'en': { name: 'English', native: 'English', phoneticDesc: 'English romanization' },
        'zh-CN': { name: 'Simplified Chinese', native: '简体中文', phoneticDesc: 'Chinese characters' },
        'zh-TW': { name: 'Traditional Chinese', native: '繁體中文', phoneticDesc: 'Chinese characters' },
        'ja': { name: 'Japanese', native: '日本語', phoneticDesc: 'Japanese Katakana' },
        'es': { name: 'Spanish', native: 'Español', phoneticDesc: 'Spanish phonetic' },
        'fr': { name: 'French', native: 'Français', phoneticDesc: 'French phonetic' },
        'de': { name: 'German', native: 'Deutsch', phoneticDesc: 'German phonetic' },
        'ru': { name: 'Russian', native: 'Русский', phoneticDesc: 'Russian Cyrillic' },
        'pt': { name: 'Portuguese', native: 'Português', phoneticDesc: 'Portuguese phonetic' },
        'it': { name: 'Italian', native: 'Italiano', phoneticDesc: 'Italian phonetic' },
        'ar': { name: 'Arabic', native: 'العربية', phoneticDesc: 'Arabic script' },
        'hi': { name: 'Hindi', native: 'हिन्दी', phoneticDesc: 'Hindi Devanagari' },
        'th': { name: 'Thai', native: 'ไทย', phoneticDesc: 'Thai script' },
        'vi': { name: 'Vietnamese', native: 'Tiếng Việt', phoneticDesc: 'Vietnamese phonetic' },
        'id': { name: 'Indonesian', native: 'Bahasa Indonesia', phoneticDesc: 'Indonesian phonetic' }
    };

    // ============================================
    // Helper Functions
    // ============================================

    /**
     * Addon 설정 가져오기
     */
    function getSetting(key, defaultValue = null) {
        return window.AIAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    /**
     * Addon 설정 저장
     */
    function setSetting(key, value) {
        window.AIAddonManager?.setAddonSetting(ADDON_INFO.id, key, value);
    }

    /**
     * 언어 정보 가져오기
     */
    function getLangInfo(lang) {
        return LANGUAGE_DATA[lang] || LANGUAGE_DATA['en'];
    }

    /**
     * 다국어 텍스트에서 현재 언어 텍스트 가져오기
     */
    function getLocalizedText(textObj, lang) {
        if (typeof textObj === 'string') return textObj;
        return textObj[lang] || textObj['en'] || Object.values(textObj)[0] || '';
    }

    /**
     * 선택된 모델 가져오기
     */
    function getSelectedModel() {
        return getSetting('model', ADDON_INFO.models.find(m => m.default)?.id || ADDON_INFO.models[0]?.id);
    }

    // ============================================
    // Prompt Builders
    // ============================================

    /**
     * 번역 프롬프트 생성
     */
    function buildTranslationPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;

        return `Translate these ${lineCount} lines of song lyrics to ${langInfo.name} (${langInfo.native}).

RULES:
- Output EXACTLY ${lineCount} lines, one translation per line
- Keep empty lines as empty
- Keep ♪ symbols and markers like [Chorus], (Yeah) as-is
- Do NOT add line numbers or prefixes
- Just output the translated lines, nothing else

INPUT:
${text}

OUTPUT (${lineCount} lines):`;
    }

    /**
     * 발음 프롬프트 생성
     */
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
- Just output the pronunciations, nothing else

INPUT:
${text}

OUTPUT (${lineCount} lines):`;
    }

    /**
     * 메타데이터 번역 프롬프트 생성
     */
    function buildMetadataPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);

        return `Translate the song title and artist name to ${langInfo.name} (${langInfo.native}).

Input:
- Title: ${title}
- Artist: ${artist}

Output valid JSON:
{
  "translatedTitle": "translated title",
  "translatedArtist": "translated artist",
  "romanizedTitle": "romanized in Latin alphabet",
  "romanizedArtist": "romanized in Latin alphabet"
}`;
    }

    /**
     * TMI 프롬프트 생성
     */
    function buildTMIPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);

        return `Generate interesting facts about the song "${title}" by "${artist}".

Output language: ${langInfo.name} (${langInfo.native})

Output valid JSON:
{
  "track": {
    "description": "2-3 sentence description",
    "trivia": ["fact 1", "fact 2", "fact 3"],
    "sources": {"verified": [], "related": [], "other": []},
    "reliability": {"confidence": "medium", "has_verified_sources": false}
  }
}

Write in ${langInfo.native}. Include 3-5 interesting facts.`;
    }

    // ============================================
    // API Functions
    // ============================================

    /**
     * API 호출 (Raw 텍스트 반환)
     * TODO: 실제 API에 맞게 구현
     */
    async function callAPIRaw(prompt, maxRetries = 3) {
        const apiKey = getSetting('api-key', '');
        if (!apiKey) {
            throw window.AddonError
                ? window.AddonError.noApiKey(ADDON_INFO.name)
                : new Error('API key is required');
        }

        const model = getSelectedModel();
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // 디버그 로깅
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.logRequest(ADDON_INFO.id, 'API_ENDPOINT');
                    window.AddonDebug.time('ai', `${ADDON_INFO.id}:api`);
                }

                // TODO: 실제 API 엔드포인트와 요청 형식으로 변경
                const response = await fetch('https://your-api.example.com/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        prompt: prompt,
                        // TODO: 추가 파라미터
                    })
                });

                // 디버그 로깅
                if (window.AddonDebug?.isEnabled()) {
                    const elapsed = window.AddonDebug.timeEnd('ai', `${ADDON_INFO.id}:api`);
                    window.AddonDebug.logResponse(ADDON_INFO.id, response.status, elapsed || 0);
                }

                // Rate limit 처리
                if (response.status === 429) {
                    throw window.AddonError
                        ? window.AddonError.rateLimited(ADDON_INFO.name)
                        : new Error('Rate limit exceeded');
                }

                // 인증 에러 처리
                if (response.status === 401 || response.status === 403) {
                    throw window.AddonError
                        ? window.AddonError.invalidApiKey(ADDON_INFO.name)
                        : new Error('Invalid API key');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                // TODO: 응답에서 텍스트 추출 (API에 따라 다름)
                const rawText = data.text || data.content || data.result || '';

                if (!rawText) {
                    throw window.AddonError
                        ? new window.AddonError('EMPTY_RESPONSE', 'Empty response from API')
                        : new Error('Empty response');
                }

                return rawText;

            } catch (e) {
                lastError = e;
                console.warn(`[${ADDON_INFO.name}] Attempt ${attempt + 1} failed:`, e.message);

                // 인증 에러는 재시도하지 않음
                if (e.code === 'INVALID_API_KEY' || e.code === 'NO_API_KEY') {
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
     * API 호출 (JSON 파싱)
     */
    async function callAPI(prompt, maxRetries = 3) {
        const rawText = await callAPIRaw(prompt, maxRetries);
        return extractJSON(rawText);
    }

    /**
     * 텍스트 응답을 줄 배열로 파싱
     */
    function parseTextLines(text, expectedLineCount) {
        // 마크다운 코드 블록 제거
        let cleaned = text.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '').trim();

        const lines = cleaned.split('\n');

        if (lines.length === expectedLineCount) {
            return lines;
        }

        if (lines.length > expectedLineCount) {
            console.warn(`[${ADDON_INFO.name}] Got ${lines.length} lines, expected ${expectedLineCount}. Trimming...`);
            return lines.slice(-expectedLineCount);
        }

        console.warn(`[${ADDON_INFO.name}] Got ${lines.length} lines, expected ${expectedLineCount}. Padding...`);
        while (lines.length < expectedLineCount) {
            lines.push('');
        }

        return lines;
    }

    /**
     * 텍스트에서 JSON 추출
     */
    function extractJSON(text) {
        let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch {
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch {
                    throw window.AddonError
                        ? new window.AddonError('JSON_PARSE_ERROR', 'Failed to parse JSON response')
                        : new Error('Failed to parse JSON');
                }
            }
            throw new Error('No valid JSON found');
        }
    }

    // ============================================
    // Addon Implementation
    // ============================================

    const YourAIAddon = {
        ...ADDON_INFO,

        /**
         * 초기화 (선택)
         */
        async init() {
            console.log(`[${ADDON_INFO.name}] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 연결 테스트 (SettingsUIBuilder에서 사용)
         */
        async testConnection() {
            await callAPIRaw('Reply with just "OK" if you receive this.');
        },

        /**
         * 설정 UI (필수)
         *
         * 방법 1: AddonUI 컴포넌트 사용 (권장)
         * 방법 2: SettingsUIBuilder 사용 (선언적 스키마)
         * 방법 3: 직접 React.createElement 사용 (Fallback)
         */
        getSettingsUI() {
            const React = Spicetify.React;
            // const { useState, useCallback } = React;  // 설정 state가 필요한 경우 주석 해제

            // =============================================
            // 방법 1: AddonUI 컴포넌트 사용 (권장)
            // =============================================
            if (window.AddonUI) {
                const UI = window.AddonUI;

                return function YourAIAddonSettingsUI() {
                    const { useState, useCallback } = Spicetify.React;

                    // 설정 state
                    const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                    const [model, setModel] = useState(getSetting('model', ADDON_INFO.models.find(m => m.default)?.id || ADDON_INFO.models[0]?.id));
                    const [testing, setTesting] = useState(false);
                    const [testResult, setTestResult] = useState(null);

                    // API 키 변경 핸들러
                    const handleApiKeyChange = useCallback((value) => {
                        setApiKey(value);
                        setSetting('api-key', value);
                        setTestResult(null);
                    }, []);

                    // 모델 변경 핸들러
                    const handleModelChange = useCallback((value) => {
                        setModel(value);
                        setSetting('model', value);
                    }, []);

                    // 연결 테스트 핸들러
                    const handleTest = useCallback(async () => {
                        if (!apiKey) {
                            setTestResult({ success: false, message: 'API key is required' });
                            return;
                        }

                        setTesting(true);
                        setTestResult(null);

                        try {
                            await YourAIAddon.testConnection();
                            setTestResult({ success: true, message: 'Connection successful!' });
                        } catch (e) {
                            setTestResult({ success: false, message: e.message || 'Connection failed' });
                        } finally {
                            setTesting(false);
                        }
                    }, [apiKey]);

                    return React.createElement(UI.SettingsContainer, { addonId: ADDON_INFO.id },
                        // Addon 헤더
                        React.createElement(UI.AddonHeader, {
                            name: ADDON_INFO.name,
                            version: ADDON_INFO.version,
                            description: typeof ADDON_INFO.description === 'string'
                                ? ADDON_INFO.description
                                : ADDON_INFO.description[Spicetify.Locale?.getLocale()?.split('-')[0]] || ADDON_INFO.description['en']
                        }),

                        // 정보 박스
                        React.createElement(UI.InfoBox, {
                            title: 'About This Addon',
                            content: 'This addon provides AI-powered translation and TMI generation.',
                            items: [
                                'Lyrics translation',
                                'Pronunciation (Smart Phonetic)',
                                'Metadata translation',
                                'TMI generation'
                            ],
                            type: 'info'  // 'info' | 'warning' | 'error' | 'success'
                        }),

                        // API 키 입력
                        React.createElement(UI.PasswordInput, {
                            label: 'API Key',
                            value: apiKey,
                            onChange: handleApiKeyChange,
                            placeholder: 'Enter your API key...',
                            description: 'Get your API key from the provider website',
                            externalUrl: ADDON_INFO.apiKeyUrl,
                            externalLabel: 'Get API Key'
                        }),

                        // 모델 선택
                        React.createElement(UI.Select, {
                            label: 'Model',
                            value: model,
                            onChange: handleModelChange,
                            options: ADDON_INFO.models
                        }),

                        // 테스트 버튼
                        React.createElement(UI.Button, {
                            label: 'Test Connection',
                            onClick: handleTest,
                            primary: true,
                            loading: testing
                        }),

                        // 테스트 결과 표시
                        testResult && React.createElement(UI.InfoBox, {
                            title: testResult.success ? 'Success' : 'Error',
                            content: testResult.message,
                            type: testResult.success ? 'success' : 'error'
                        })

                        // 추가 설정 예시:
                        // React.createElement(UI.Toggle, {
                        //     label: 'Enable cache',
                        //     value: enableCache,
                        //     onChange: (value) => { setEnableCache(value); setSetting('enable-cache', value); },
                        //     description: 'Cache translation results locally'
                        // }),

                        // React.createElement(UI.Slider, {
                        //     label: 'Temperature',
                        //     value: temperature,
                        //     onChange: (value) => { setTemperature(value); setSetting('temperature', value); },
                        //     min: 0,
                        //     max: 2,
                        //     step: 0.1,
                        //     description: 'Higher values make output more creative'
                        // }),

                        // React.createElement(UI.TextArea, {
                        //     label: 'Custom Prompt Prefix',
                        //     value: customPrompt,
                        //     onChange: (value) => { setCustomPrompt(value); setSetting('custom-prompt', value); },
                        //     placeholder: 'Add custom instructions...',
                        //     rows: 3
                        // })
                    );
                };
            }

            // =============================================
            // 방법 2: SettingsUIBuilder 사용 (선언적 스키마)
            // =============================================
            if (window.SettingsUIBuilder) {
                const schema = [
                    // 정보 박스
                    {
                        type: 'info',
                        label: 'About This Addon',
                        content: 'This addon provides AI-powered translation and TMI generation.',
                        items: ['Lyrics translation', 'Pronunciation', 'Metadata translation', 'TMI generation']
                    },

                    // API 키 입력
                    {
                        type: 'password',
                        key: 'api-key',
                        label: 'API Key',
                        placeholder: 'Enter your API key...',
                        description: 'Get your API key from the provider website',
                        externalUrl: ADDON_INFO.apiKeyUrl,
                        externalLabel: 'Get API Key'
                    },

                    // 모델 선택
                    {
                        type: 'select',
                        key: 'model',
                        label: 'Model',
                        options: ADDON_INFO.models,
                        defaultValue: ADDON_INFO.models.find(m => m.default)?.id
                    },

                    // 테스트 버튼
                    {
                        type: 'button',
                        action: 'test',
                        label: 'Test Connection',
                        primary: true
                    }

                    // 추가 설정 예시:
                    // { type: 'checkbox', key: 'enable-cache', label: 'Enable cache' },
                    // { type: 'text', key: 'custom-endpoint', label: 'Custom Endpoint', placeholder: 'https://...' }
                ];

                return window.SettingsUIBuilder.build(schema, {
                    addonId: ADDON_INFO.id,
                    manager: window.AIAddonManager,
                    addon: this  // testConnection 메서드 사용을 위해
                });
            }

            // =============================================
            // 방법 3: Fallback - 직접 React.createElement 사용
            // =============================================
            return function FallbackSettings() {
                const { useState, useCallback } = Spicetify.React;

                const [apiKey, setApiKey] = useState(getSetting('api-key', ''));

                const handleChange = useCallback((e) => {
                    setApiKey(e.target.value);
                    setSetting('api-key', e.target.value);
                }, []);

                return React.createElement('div', { className: 'ai-addon-settings' },
                    React.createElement('div', { className: 'ai-addon-header' },
                        React.createElement('h3', null, ADDON_INFO.name),
                        React.createElement('span', { className: 'ai-addon-version' }, `v${ADDON_INFO.version}`)
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'API Key'),
                        React.createElement('input', {
                            type: 'password',
                            value: apiKey,
                            onChange: handleChange,
                            placeholder: 'Enter API key...'
                        })
                    )
                );
            };
        },

        /**
         * 가사 번역/발음 생성
         * @param {Object} params
         * @param {string} params.text - 번역할 가사 (\n으로 줄 구분)
         * @param {string} params.lang - 대상 언어 코드
         * @param {boolean} params.wantSmartPhonetic - true면 발음, false면 번역
         */
        async translateLyrics({ text, lang, wantSmartPhonetic }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const expectedLineCount = text.split('\n').length;
            const prompt = wantSmartPhonetic
                ? buildPhoneticPrompt(text, lang)
                : buildTranslationPrompt(text, lang);

            const rawResponse = await callAPIRaw(prompt);
            const lines = parseTextLines(rawResponse, expectedLineCount);

            if (wantSmartPhonetic) {
                return { phonetic: lines };
            } else {
                return { translation: lines };
            }
        },

        /**
         * 메타데이터 번역
         * @param {Object} params
         * @param {string} params.title - 곡 제목
         * @param {string} params.artist - 아티스트
         * @param {string} params.lang - 대상 언어 코드
         */
        async translateMetadata({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildMetadataPrompt(title, artist, lang);
            return await callAPI(prompt);
        },

        /**
         * TMI 생성
         * @param {Object} params
         * @param {string} params.title - 곡 제목
         * @param {string} params.artist - 아티스트
         * @param {string} params.lang - 대상 언어 코드
         */
        async generateTMI({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildTMIPrompt(title, artist, lang);
            return await callAPI(prompt);
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.AIAddonManager) {
            const success = window.AIAddonManager.register(YourAIAddon);
            if (success) {
                console.log(`[${ADDON_INFO.name}] Registered successfully`);

                // 이벤트 발생 (EventEmitter가 있는 경우)
                if (window.AIAddonManager.emit) {
                    window.AIAddonManager.emit('addon:registered', {
                        id: ADDON_INFO.id,
                        type: 'ai'
                    });
                }
            }
        } else {
            // AIAddonManager가 아직 로드되지 않은 경우 재시도
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log(`[${ADDON_INFO.name}] Module loaded`);
})();
