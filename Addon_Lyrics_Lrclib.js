/**
 * LRCLIB Lyrics Provider Addon (Reference for Community Database Lyrics)
 * 
 * [English]
 * This file demonstrates a lyrics provider addon using a public API (LRCLIB).
 * It shows how to fetch LRC data and parse it into ivLyrics format.
 * 
 * [Korean]
 * 이 파일은 공개 API(LRCLIB)를 사용하는 가사 제공자 애드온의 예시입니다.
 * LRC 데이터를 가져와 ivLyrics 형식으로 파싱하는 방법을 보여줍니다.
 * 
 * @addon-type lyrics
 * @id lrclib
 * @version 1.0.0
 */

(() => {
    'use strict';

    // ============================================
    // 1. Addon Metadata
    // ============================================
    const ADDON_INFO = {
        id: 'lrclib',
        name: 'LRCLIB',
        author: 'ivLis STUDIO',
        version: '1.0.0',
        description: {
            en: 'Get lyrics from LRCLIB open-source lyrics database',
            ko: 'LRCLIB 오픈소스 가사 데이터베이스에서 가사를 가져옵니다'
        },
        supports: {
            karaoke: false,
            synced: true,
            unsynced: true
        },
        useIvLyricsSync: true,
        // [English] Simple SVG icon
        icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V8z'
    };

    const LRCLIB_API_BASE = 'https://lrclib.net/api';

    // ============================================
    // 2. Helper Functions (LRC Parser)
    // ============================================

    /**
     * [English] Parse standard LRC text
     * [Korean] 표준 LRC 텍스트 파싱
     */
    function parseLRC(lrc) {
        const lines = lrc.split('\n');
        const synced = [];
        const unsynced = [];

        for (const line of lines) {
            // [mm:ss.xx] or [mm:ss.xxx]
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
    // 3. Addon Implementation
    // ============================================
    const LrclibLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            console.log(`[LRCLIB Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;

            return function LrclibLyricsSettings() {
                // [English] Simple info UI
                return React.createElement('div', { className: 'lyrics-addon-settings lrclib-settings' },
                    React.createElement('div', { className: 'lyrics-addon-info' },
                        React.createElement('p', null, 'LRCLIB는 커뮤니티 기반 오픈소스 가사 데이터베이스입니다.'),
                        React.createElement('p', { className: 'lyrics-addon-note' },
                            '가사가 없는 경우 ',
                            React.createElement('a', { href: 'https://lrclib.net', target: '_blank', rel: 'noopener noreferrer' }, 'lrclib.net'),
                            '에서 직접 기여할 수 있습니다.'
                        )
                    )
                );
            };
        },

        async getLyrics(info) {
            const result = {
                uri: info.uri,
                provider: 'lrclib',
                karaoke: null,
                synced: null,
                unsynced: null,
                copyright: null,
                error: null
            };

            // [English] Prepare parameters for API call
            // [Korean] API 호출을 위한 파라미터 준비
            const params = {
                track_name: info.title,
                artist_name: info.artist,
                album_name: info.album || '',
                duration: Math.floor((info.duration || 0) / 1000)
            };

            const queryString = Object.entries(params)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join('&');

            const url = `${LRCLIB_API_BASE}/get?${queryString}`;

            let body;
            try {
                const response = await fetch(url, {
                    headers: {
                        // [English] Use a polite User-Agent
                        'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'} (https://github.com/spicetify/cli)`
                    }
                });

                if (response.status !== 200) {
                    result.error = 'No lyrics';
                    return result;
                }

                body = await response.json();
            } catch (e) {
                result.error = 'Request error';
                return result;
            }

            // [English] Handle Instrumental tracks
            // [Korean] 연주곡 처리
            if (body.instrumental) {
                result.synced = [{ startTime: 0, text: '♪ Instrumental ♪' }];
                result.unsynced = [{ text: '♪ Instrumental ♪' }];
                return result;
            }

            // [English] Parse lyrics from response
            // [Korean] 응답에서 가사 파싱
            if (body.syncedLyrics) {
                const parsed = parseLRC(body.syncedLyrics);
                result.synced = parsed.synced;
                if (!result.unsynced) {
                    result.unsynced = parsed.unsynced;
                }
            }

            if (body.plainLyrics) {
                const parsed = parseLRC(body.plainLyrics);
                result.unsynced = parsed.unsynced;
            }

            if (!result.synced && !result.unsynced) {
                result.error = 'No lyrics';
                return result;
            }

            return result;
        }
    };

    // ============================================
    // 4. Registration
    // ============================================
    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(LrclibLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log('[LRCLIB Lyrics Addon] Module loaded');
})();
