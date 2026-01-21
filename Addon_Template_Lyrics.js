/**
 * [YOUR_NAME] Lyrics Provider Addon - Template
 * [설명을 여기에 작성하세요]
 *
 * @addon-type lyrics
 * @id [your-addon-id]
 * @name [Your Addon Name]
 * @version 1.0.0
 * @author [Your Name]
 * @supports karaoke: [true/false]
 * @supports synced: [true/false]
 * @supports unsynced: [true/false]
 *
 * ============================================
 * Lyrics Addon 개발 가이드
 * ============================================
 *
 * 필수 필드:
 * - id: string (고유 ID, 영문 소문자 권장)
 * - name: string (표시 이름)
 * - author: string (제작자)
 * - description: string | { en: string, ko: string, ... } (설명)
 * - version: string (버전)
 * - supports: { karaoke: boolean, synced: boolean, unsynced: boolean }
 *
 * 필수 메서드:
 * - getLyrics(info): Promise<LyricsResult>
 *
 * 선택 메서드:
 * - getSettingsUI(): React.Component (설정 UI)
 * - init(): Promise<void> (초기화)
 *
 * LyricsResult 형식:
 * {
 *   uri: string,                    // 트랙 URI
 *   provider: string,               // Provider ID
 *   karaoke: Array | null,          // 노래방 가사 (단어별 타이밍)
 *   synced: Array | null,           // 싱크 가사 (줄별 타이밍)
 *   unsynced: Array | null,         // 일반 가사 (타이밍 없음)
 *   copyright: string | null,       // 저작권 정보
 *   error: string | null            // 에러 메시지
 * }
 *
 * karaoke 형식:
 * [{ startTime: number, text: string, syllables?: [{ text: string, startTime: number, endTime: number }] }]
 *
 * synced 형식:
 * [{ startTime: number, text: string }]
 *
 * unsynced 형식:
 * [{ text: string }]
 */

(() => {
    'use strict';

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'your-addon-id',                    // TODO: 고유 ID로 변경
        name: 'Your Addon Name',                 // TODO: 표시 이름으로 변경
        author: 'Your Name',                     // TODO: 제작자 이름으로 변경
        version: '1.0.0',
        description: {
            en: 'English description here',      // TODO: 영어 설명
            ko: '한국어 설명을 여기에'              // TODO: 한국어 설명
        },
        // 지원하는 가사 유형
        supports: {
            karaoke: false,   // 노래방 가사 (단어별 타이밍) 지원 여부
            synced: true,     // 싱크 가사 (줄별 타이밍) 지원 여부
            unsynced: true    // 일반 가사 (타이밍 없음) 지원 여부
        },
        // ivLyrics Sync 데이터 자동 적용 여부
        // true로 설정하면 커뮤니티 sync-data로 karaoke 지원 가능
        useIvLyricsSync: true,
        // 아이콘 (선택, SVG path 문자열)
        icon: null
    };

    // ============================================
    // Constants & Configuration
    // ============================================

    // TODO: API 엔드포인트 등 설정
    const API_BASE_URL = 'https://your-api.example.com';

    // ============================================
    // Helper Functions
    // ============================================

    /**
     * Addon 설정 가져오기 헬퍼
     */
    function getSetting(key, defaultValue = null) {
        return window.LyricsAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    /**
     * Addon 설정 저장 헬퍼
     */
    function setSetting(key, value) {
        window.LyricsAddonManager?.setAddonSetting(ADDON_INFO.id, key, value);
    }

    /**
     * LRC 형식 파싱 (필요한 경우 사용)
     * @param {string} lrc - LRC 형식 가사
     * @returns {{ synced: Array|null, unsynced: Array }}
     */
    function parseLRC(lrc) {
        const lines = lrc.split('\n');
        const synced = [];
        const unsynced = [];

        for (const line of lines) {
            // [mm:ss.xx] 또는 [mm:ss.xxx] 형식 매칭
            const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = match[3].length === 2
                    ? parseInt(match[3], 10) * 10
                    : parseInt(match[3], 10);
                const startTime = (minutes * 60 + seconds) * 1000 + milliseconds;
                const text = match[4].trim();

                synced.push({ startTime, text });
                unsynced.push({ text });
            } else if (line.trim() && !line.startsWith('[')) {
                unsynced.push({ text: line.trim() });
            }
        }

        return {
            synced: synced.length > 0 ? synced : null,
            unsynced
        };
    }

    // ============================================
    // Addon Implementation
    // ============================================

    const YourLyricsAddon = {
        ...ADDON_INFO,

        /**
         * 초기화 (선택)
         * Manager가 초기화될 때 호출됩니다.
         */
        async init() {
            console.log(`[${ADDON_INFO.name}] Initialized (v${ADDON_INFO.version})`);

            // TODO: 필요한 초기화 작업 수행
            // 예: API 연결 확인, 캐시 로드 등
        },

        /**
         * 설정 UI (선택)
         * Settings 페이지에서 표시될 React 컴포넌트를 반환합니다.
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

                return function YourAddonSettingsUI() {
                    // 설정 state (필요한 경우)
                    // const [apiKey, setApiKey] = useState(getSetting('api-key', ''));
                    // const [quality, setQuality] = useState(getSetting('quality', 'medium'));

                    // 값 변경 핸들러 예시
                    // const handleApiKeyChange = useCallback((value) => {
                    //     setApiKey(value);
                    //     setSetting('api-key', value);
                    // }, []);

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
                            content: 'This addon provides lyrics from [source].',
                            items: [
                                'Feature 1',
                                'Feature 2',
                                'Feature 3'
                            ],
                            type: 'info'  // 'info' | 'warning' | 'error' | 'success'
                        })

                        // API 키 입력 (필요한 경우)
                        // React.createElement(UI.PasswordInput, {
                        //     label: 'API Key',
                        //     value: apiKey,
                        //     onChange: handleApiKeyChange,
                        //     placeholder: 'Enter your API key...',
                        //     description: 'Get your API key from [website]',
                        //     externalUrl: 'https://example.com/api-keys',
                        //     externalLabel: 'Get Key'
                        // }),

                        // 셀렉트 (드롭다운)
                        // React.createElement(UI.Select, {
                        //     label: 'Lyrics Quality',
                        //     value: quality,
                        //     onChange: (value) => { setQuality(value); setSetting('quality', value); },
                        //     options: [
                        //         { id: 'high', name: 'High (Slower)' },
                        //         { id: 'medium', name: 'Medium' },
                        //         { id: 'low', name: 'Low (Faster)' }
                        //     ]
                        // }),

                        // 토글 스위치
                        // React.createElement(UI.Toggle, {
                        //     label: 'Include translations if available',
                        //     value: includeTranslation,
                        //     onChange: (value) => { setIncludeTranslation(value); setSetting('include-translation', value); },
                        //     description: 'Show translated lyrics when available'
                        // }),

                        // 텍스트 입력
                        // React.createElement(UI.TextInput, {
                        //     label: 'Custom Endpoint',
                        //     value: customEndpoint,
                        //     onChange: (value) => { setCustomEndpoint(value); setSetting('custom-endpoint', value); },
                        //     placeholder: 'https://...',
                        //     description: 'Optional: Use a custom API endpoint'
                        // }),

                        // 버튼
                        // React.createElement(UI.Button, {
                        //     label: 'Test Connection',
                        //     onClick: handleTest,
                        //     primary: true,
                        //     loading: testing
                        // }),

                        // 슬라이더
                        // React.createElement(UI.Slider, {
                        //     label: 'Timeout (seconds)',
                        //     value: timeout,
                        //     onChange: (value) => { setTimeout(value); setSetting('timeout', value); },
                        //     min: 1,
                        //     max: 30,
                        //     step: 1
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
                        content: 'This addon provides lyrics from [source].',
                        items: ['Feature 1', 'Feature 2', 'Feature 3']
                    }
                    // API 키 입력 (필요한 경우)
                    // { type: 'password', key: 'api-key', label: 'API Key', placeholder: '...', externalUrl: '...' },
                    // { type: 'select', key: 'quality', label: 'Quality', options: [...] },
                    // { type: 'checkbox', key: 'include-translation', label: 'Include translations' }
                ];

                return window.SettingsUIBuilder.build(schema, {
                    addonId: ADDON_INFO.id,
                    manager: window.LyricsAddonManager,
                    addon: ADDON_INFO
                });
            }

            // =============================================
            // 방법 3: Fallback - 직접 React.createElement 사용
            // =============================================
            return function YourAddonSettings() {
                return React.createElement('div', { className: 'lyrics-addon-settings' },
                    React.createElement('div', { className: 'lyrics-addon-info' },
                        React.createElement('p', null, 'This addon provides lyrics from [source].')
                    )
                );
            };
        },

        /**
         * 가사 가져오기 (필수)
         * @param {Object} info - 트랙 정보
         * @param {string} info.uri - Spotify 트랙 URI (예: 'spotify:track:xxxxx')
         * @param {string} info.title - 곡 제목
         * @param {string} info.artist - 아티스트
         * @param {string} info.album - 앨범 (선택)
         * @param {number} info.duration - 곡 길이 (ms)
         * @returns {Promise<LyricsResult>}
         */
        async getLyrics(info) {
            // 결과 객체 초기화
            const result = {
                uri: info.uri,
                provider: ADDON_INFO.id,
                karaoke: null,
                synced: null,
                unsynced: null,
                copyright: null,
                error: null
            };

            // 디버그 로깅 (개발 시 유용)
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('lyrics', `[${ADDON_INFO.id}] Fetching lyrics`, {
                    title: info.title,
                    artist: info.artist
                });
                window.AddonDebug.time('lyrics', `${ADDON_INFO.id}:getLyrics`);
            }

            try {
                // TODO: 실제 API 호출 구현
                // 예시:
                // const response = await fetch(`${API_BASE_URL}/lyrics?${params}`);
                // const data = await response.json();

                // 에러 처리 예시 (AddonError 사용 권장)
                // if (!response.ok) {
                //     throw window.AddonError
                //         ? new window.AddonError('API_ERROR', `HTTP ${response.status}`)
                //         : new Error(`HTTP ${response.status}`);
                // }

                // 가사가 없는 경우
                // if (!data.lyrics) {
                //     result.error = 'No lyrics';
                //     return result;
                // }

                // LRC 형식인 경우 파싱
                // if (data.syncedLyrics) {
                //     const parsed = parseLRC(data.syncedLyrics);
                //     result.synced = parsed.synced;
                //     result.unsynced = parsed.unsynced;
                // }

                // 일반 텍스트인 경우
                // if (data.plainLyrics) {
                //     result.unsynced = data.plainLyrics
                //         .split('\n')
                //         .map(text => ({ text: text.trim() }));
                // }

                // 저작권 정보 (있는 경우)
                // result.copyright = data.copyright || null;

                // 현재는 에러 반환 (구현 필요)
                result.error = 'Not implemented';
                return result;

            } catch (e) {
                console.error(`[${ADDON_INFO.name}] getLyrics error:`, e);

                // AddonError인 경우 그대로 전달
                if (e.name === 'AddonError') {
                    result.error = e.message;
                } else {
                    result.error = e.message || 'Unknown error';
                }

                return result;

            } finally {
                // 디버그 타이머 종료
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('lyrics', `${ADDON_INFO.id}:getLyrics`);
                }
            }
        }
    };

    // ============================================
    // Registration
    // ============================================

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            const success = window.LyricsAddonManager.register(YourLyricsAddon);
            if (success) {
                console.log(`[${ADDON_INFO.name}] Registered successfully`);

                // 이벤트 발생 (EventEmitter가 있는 경우)
                if (window.LyricsAddonManager.emit) {
                    window.LyricsAddonManager.emit('addon:registered', {
                        id: ADDON_INFO.id,
                        type: 'lyrics'
                    });
                }
            }
        } else {
            // LyricsAddonManager가 아직 로드되지 않은 경우 재시도
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log(`[${ADDON_INFO.name}] Module loaded`);
})();
