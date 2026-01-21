/**
 * Spotify Lyrics Provider Addon (Reference for Lyrics Addon)
 * 
 * [English]
 * This file serves as a reference for creating a Lyrics Provider Addon.
 * It demonstrates how to fetch lyrics from an external source (in this case, Spotify's internal API)
 * and return them in a standardized format for ivLyrics.
 * 
 * [Korean]
 * 이 파일은 가사 제공자(Lyrics Provider) 애드온을 만들기 위한 레퍼런스입니다.
 * 외부 소스(여기서는 Spotify 내부 API)에서 가사를 가져와 ivLyrics 표준 형식으로 반환하는 방법을 보여줍니다.
 * 
 * @addon-type lyrics
 * @id spotify
 * @version 1.0.0
 */

(() => {
    'use strict';

    // ============================================
    // 1. Addon Metadata (메타데이터 정의)
    // ============================================
    /**
     * [English]
     * Define the basic information and capabilities of the addon.
     * - id: Unique identifier (must be unique across all addons)
     * - supports: What types of lyrics this provider supports (synced, unsynced, karaoke)
     * 
     * [Korean]
     * 애드온의 기본 정보와 기능을 정의합니다.
     * - id: 고유 식별자 (모든 애드온 중에서 유일해야 함)
     * - supports: 이 제공자가 지원하는 가사 유형 (싱크, 일반, 노래방)
     */
    const ADDON_INFO = {
        id: 'spotify',
        name: 'Spotify',
        author: 'ivLis STUDIO',
        version: '1.0.0',
        description: {
            en: 'Get lyrics from Spotify\'s built-in lyrics service (Musixmatch, PetitLyrics, etc.)',
            ko: 'Spotify 내장 가사 서비스에서 가사를 가져옵니다 (Musixmatch, PetitLyrics 등)'
        },
        // [English] Capabilities configuration
        // [Korean] 기능 지원 설정
        supports: {
            karaoke: false,   // [English] Karaoke mode (word-by-word sync) / [Korean] 노래방 모드 (단어별 싱크)
            synced: true,     // [English] Line-synced lyrics / [Korean] 라인별 싱크 가사
            unsynced: true    // [English] Plain text lyrics / [Korean] 일반 텍스트 가사
        },
        // [English] If true, ivLyrics will try to find community sync data for this provider
        // [Korean] true일 경우, ivLyrics가 커뮤니티 싱크 데이터를 자동으로 찾아서 적용을 시도합니다
        useIvLyricsSync: true,

        // [English] SVG Icon path (24x24 standard)
        // [Korean] SVG 아이콘 경로 (24x24 표준)
        icon: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'
    };

    const LYRICS_API_BASE = 'https://spclient.wg.spotify.com/color-lyrics/v2/track/';

    // ============================================
    // 2. Addon Implementation (구현부)
    // ============================================
    /**
     * [English]
     * The main addon object that implements the required methods.
     * 
     * [Korean]
     * 필수 메서드를 구현하는 메인 애드온 객체입니다.
     */
    const SpotifyLyricsAddon = {
        ...ADDON_INFO,

        /**
         * [English]
         * Initialization method (Optional). Called when the addon is registered.
         * 
         * [Korean]
         * 초기화 메서드 (선택 사항). 애드온이 등록될 때 호출됩니다.
         */
        async init() {
            console.log(`[Spotify Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * [English]
         * Returns a React component for the settings UI.
         * The component should handle its own state and persistence (e.g., using localStorage).
         * 
         * [Korean]
         * 설정 UI를 위한 React 컴포넌트를 반환합니다.
         * 컴포넌트는 자체적인 상태 관리와 저장(예: localStorage 사용)을 처리해야 합니다.
         * 
         * @returns {Function} React Function Component
         */
        getSettingsUI() {
            const React = Spicetify.React;

            // [English] Return a simple functional component
            // [Korean] 간단한 함수형 컴포넌트 반환
            return function SpotifyLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings spotify-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '20px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 'bold', marginBottom: '8px' } }, 'Spotify Premium Features'),
                            React.createElement('p', null, 'This addon retrieves lyrics directly from Spotify\'s internal servers.'),
                            React.createElement('ul', { style: { paddingLeft: '20px', marginTop: '8px', opacity: 0.8 } },
                                React.createElement('li', null, 'Requires Spotify Premium'),
                                React.createElement('li', null, 'Supports multiple providers (Musixmatch, PetitLyrics, etc.)'),
                                React.createElement('li', null, 'High accuracy & sync quality')
                            )
                        )
                    )
                );
            };
        },

        /**
         * [English]
         * Main method to fetch lyrics.
         * 
         * [Korean]
         * 가사를 가져오는 메인 메서드입니다.
         * 
         * @param {Object} info
         * @param {string} info.uri - Track URI (e.g., "spotify:track:...")
         * @param {string} info.title - Track Title
         * @param {string} info.artist - Artist Name
         * @param {string} info.album - Album Name
         * @param {number} info.duration - Track duration in ms
         * 
         * @returns {Promise<Object>} Lyrics Result Object
         */
        async getLyrics(info) {
            // [English] Initialize the result object with default null values
            // [Korean] 결과 객체를 기본 null 값으로 초기화합니다
            const result = {
                uri: info.uri,
                provider: 'spotify',
                /**
                 * [English] Karaoke Lyrics Format
                 * To support karaoke (word-by-word sync), return an array of line objects.
                 * Each line object must have 'startTime' and 'text', and an array of 'syllables'.
                 * 
                 * Example:
                 * karaoke: [
                 *   {
                 *     startTime: 1000,
                 *     text: "Hello world",
                 *     syllables: [
                 *       { text: "Hel", startTime: 1000, endTime: 1500 },
                 *       { text: "lo", startTime: 1500, endTime: 2000 },
                 *       { text: " ", startTime: 2000, endTime: 2100 },
                 *       { text: "world", startTime: 2100, endTime: 3000 }
                 *     ]
                 *   },
                 *   ...
                 * ]
                 * 
                 * [Korean] 노래방 가사 형식
                 * 노래방(단어별 싱크)을 지원하려면 라인 객체의 배열을 반환해야 합니다.
                 * 각 라인 객체는 'startTime', 'text'와 함께 'syllables' 배열을 가져야 합니다.
                 * (위의 Example 참고)
                 */
                karaoke: null,   // Array or null
                synced: null,    // Array or null
                unsynced: null,  // Array or null
                copyright: null, // string or null
                error: null,     // string or null
                spotifyLyricsProvider: null // Custom field (Optional)
            };

            const trackId = info.uri.split(':')[2];

            // [English] Call external API (Spotify Internal API in this case)
            // [Korean] 외부 API 호출 (여기서는 Spotify 내부 API)
            let body;
            try {
                body = await Spicetify.CosmosAsync.get(
                    `${LYRICS_API_BASE}${trackId}?format=json&vocalRemoval=false&market=from_token`
                );
            } catch (e) {
                result.error = 'Request error';
                return result;
            }

            const lyrics = body?.lyrics;
            if (!lyrics) {
                result.error = 'No lyrics';
                return result;
            }

            // [English] Extract specific metadata
            // [Korean] 특정 메타데이터 추출
            const spotifyLyricsProvider = lyrics.provider || 'unknown';
            result.spotifyLyricsProvider = spotifyLyricsProvider;
            result.provider = `spotify-${spotifyLyricsProvider}`;

            // [English] Parse lyrics into standardized format
            // [Korean] 가사를 표준 형식으로 파싱
            const lines = lyrics.lines;

            // [English] Check if lyrics satisfy sync conditions
            // [Korean] 가사가 싱크 조건을 만족하는지 확인
            if (lyrics.syncType === 'LINE_SYNCED' || lyrics.syncType === 'SYLLABLE_SYNCED') {
                result.synced = lines.map(line => {
                    // [English] Try to get the most accurate start time
                    // [Korean] 가장 정확한 시작 시간을 가져오려고 시도
                    let startTime = parseInt(line.startTimeMs, 10);
                    if (isNaN(startTime) && line.syllables && line.syllables.length > 0) {
                        startTime = parseInt(line.syllables[0].startTimeMs, 10);
                    }

                    return {
                        startTime: startTime || 0,
                        text: line.words || ''
                    };
                });
                result.unsynced = result.synced; // [English] Fallback for unsynced
            } else {
                result.unsynced = lines.map(line => ({
                    text: line.words || ''
                }));
            }

            return result;
        }
    };

    // ============================================
    // 3. Registration (등록)
    // ============================================

    /**
     * [English]
     * Register the addon with the LyricsAddonManager.
     * We use a timeout loop to wait for the manager to be available.
     * 
     * [Korean]
     * LyricsAddonManager에 애드온을 등록합니다.
     * 매니저가 준비될 때까지 기다리기 위해 타임아웃 루프를 사용합니다.
     */
    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(SpotifyLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log('[Spotify Lyrics Addon] Module loaded');
})();
