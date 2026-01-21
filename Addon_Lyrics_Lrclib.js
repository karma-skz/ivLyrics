/**
 * LRCLIB Lyrics Provider Addon
 * LRCLIB 오픈소스 가사 데이터베이스에서 가사를 제공합니다.
 *
 * @addon-type lyrics
 * @id lrclib
 * @name LRCLIB
 * @version 1.0.0
 * @author ivLis STUDIO
 * @supports karaoke: false (커뮤니티 sync-data를 통해 지원 가능)
 * @supports synced: true
 * @supports unsynced: true
 */

(() => {
    'use strict';

    // ============================================
    // Addon Metadata
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
        // 지원하는 가사 유형
        supports: {
            karaoke: false,   // 기본적으로 노래방 가사 미지원 (sync-data로 확장 가능)
            synced: true,     // 싱크 가사 지원
            unsynced: true    // 일반 가사 지원
        },
        // ivLyrics Sync 데이터 자동 적용 여부
        useIvLyricsSync: true,
        // 아이콘 (SVG path) - LRC 파일 아이콘
        icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V8z'
    };

    // ============================================
    // API Endpoints
    // ============================================

    const LRCLIB_API_BASE = 'https://lrclib.net/api';

    // ============================================
    // Helper Functions
    // ============================================

    /**
     * LRC 형식 파싱
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
                // 메타데이터가 아닌 일반 텍스트
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

    const LrclibLyricsAddon = {
        ...ADDON_INFO,

        /**
         * 초기화
         */
        async init() {
            console.log(`[LRCLIB Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 설정 UI
         */
        getSettingsUI() {
            const React = Spicetify.React;

            return function LrclibLyricsSettings() {
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

        /**
         * 가사 가져오기
         * @param {Object} info - 트랙 정보 { uri, title, artist, album, duration }
         * @returns {Promise<LyricsResult>}
         */
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

            const trackId = info.uri.split(':')[2];

            // LRCLIB API 호출
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

            // Instrumental 체크
            if (body.instrumental) {
                result.synced = [{ startTime: 0, text: '♪ Instrumental ♪' }];
                result.unsynced = [{ text: '♪ Instrumental ♪' }];
                return result;
            }

            // 싱크 가사 파싱
            if (body.syncedLyrics) {
                const parsed = parseLRC(body.syncedLyrics);
                result.synced = parsed.synced;
                if (!result.unsynced) {
                    result.unsynced = parsed.unsynced;
                }
            }

            // 일반 가사 파싱
            if (body.plainLyrics) {
                const parsed = parseLRC(body.plainLyrics);
                result.unsynced = parsed.unsynced;
            }

            // 가사가 없는 경우
            if (!result.synced && !result.unsynced) {
                result.error = 'No lyrics';
                return result;
            }

            return result;
        }
    };

    // ============================================
    // Registration
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
