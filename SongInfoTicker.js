/**
 * Song Info TMI Component
 * - Fullscreen TMI view when album art is clicked
 */

const SongInfoTMI = (() => {
    const { useState, useEffect, useRef, useCallback, useMemo } = Spicetify.React;

    // Cache for TMI data (메모리 캐시 - 빠른 조회용, IndexedDB도 함께 사용)
    const tmiCache = new Map();

    // Simple markdown bold parser
    const renderMarkdown = (text) => {
        if (!text) return null;
        const parts = text.split(/(\*\*.*?\*\*)/);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return react.createElement("strong", { key: i }, part.slice(2, -2));
            }
            return part;
        });
    };

    // Fetch song info from backend
    async function fetchSongInfo(trackId, regenerate = false) {
        // SongDataService와 동일한 언어 설정 사용 (translation-language 우선, language 폴백)
        const lang = CONFIG.visual["translation-language"] || CONFIG.visual["language"] || 'en';

        // Check memory cache first (skip if regenerating)
        if (!regenerate && tmiCache.has(`${trackId}:${lang}`)) {
            return tmiCache.get(`${trackId}:${lang}`);
        }

        // Check SongDataService cache (skip if regenerating)
        // 주의: song-data 요청 시 songInfo가 null이었다면 DB에 없는 것이므로 API 호출 필요
        if (!regenerate) {
            const songDataCached = window.SongDataService?.getCachedData(trackId);
            if (songDataCached?.songInfo) {
                console.log(`[SongInfoTMI] Using SongDataService cached info for ${trackId}`);
                tmiCache.set(`${trackId}:${lang}`, songDataCached.songInfo);
                return songDataCached.songInfo;
            }
        }

        // Check IndexedDB cache (skip if regenerating)
        if (!regenerate) {
            try {
                const localCached = await LyricsCache.getTMI(trackId, lang);
                if (localCached) {
                    // 메모리 캐시에도 저장
                    tmiCache.set(`${trackId}:${lang}`, localCached);
                    return localCached;
                }
            } catch (e) {
                console.warn('[SongInfoTMI] Local cache check failed:', e);
            }
        }

        // AIAddonManager를 통한 TMI 생성
        if (window.AIAddonManager) {
            const tmiProvider = window.AIAddonManager.getProvider('tmi');
            if (tmiProvider) {
                console.log(`[SongInfoTMI] Using AIAddonManager for TMI (provider: ${tmiProvider})`);

                try {
                    // 현재 트랙 정보 가져오기
                    const trackData = Spicetify.Player.data?.item;
                    const title = trackData?.name || '';
                    const artist = trackData?.artists?.map(a => a.name).join(', ') || '';
                    const album = trackData?.album?.name || '';

                    const result = await window.AIAddonManager.generateTMI({
                        trackId,
                        title,
                        artist,
                        album,
                        lang
                    });

                    if (result && result.track) {
                        const cacheKey = `${trackId}:${lang}`;
                        tmiCache.set(cacheKey, result);
                        LyricsCache.setTMI(trackId, lang, result).catch(() => { });
                        return result;
                    }
                } catch (e) {
                    console.warn('[SongInfoTMI] AIAddonManager TMI generation failed:', e);
                    return { error: true, message: e.message || 'TMI generation failed' };
                }
            }
        }

        // AI 제공자가 설정되지 않았으면 에러 반환
        console.log('[SongInfoTMI] No AI provider configured for TMI generation');
        return { error: true, message: 'AI 제공자가 설정되지 않았습니다. 설정에서 TMI 제공자를 선택해주세요.' };
    }

    // Source link renderer helper - supports new {title, uri} format
    const renderSourceLinks = (sources, isVerified) => {
        if (!sources || sources.length === 0) return null;

        return react.createElement("div", { className: "tmi-sources" },
            sources.map((source, i) => {
                // Support both old URL string format and new {title, uri} format
                const url = typeof source === 'string' ? source : source?.uri;
                const title = typeof source === 'string' ? null : source?.title;

                if (!url) return null;

                // Extract display text: use title if available, otherwise extract hostname
                let displayText;
                try {
                    displayText = title || new URL(url).hostname.replace('www.', '').replace('vertexaisearch.cloud.google.com', 'Google Search');
                } catch {
                    displayText = title || url;
                }

                return react.createElement("a", {
                    key: i,
                    href: url,
                    className: "tmi-source-link",
                    onClick: (e) => {
                        e.preventDefault();
                        window.open(url, '_blank');
                    },
                    title: url
                },
                    react.createElement("span", { className: "tmi-source-icon" }, "🔗"),
                    react.createElement("span", { className: "tmi-source-text" }, displayText)
                );
            }).filter(Boolean)
        );
    };

    // Reliability badge component based on confidence level
    const ReliabilityBadge = ({ reliability }) => {
        if (!reliability) return null;

        const { confidence, has_verified_sources, verified_source_count, related_source_count, total_source_count, unique_domains } = reliability;

        // Determine badge style and text based on confidence
        const badgeConfig = {
            very_high: { icon: "✓✓", className: "very-high", textKey: "tmi.confidenceVeryHigh" },
            high: { icon: "✓", className: "high", textKey: "tmi.confidenceHigh" },
            medium: { icon: "◐", className: "medium", textKey: "tmi.confidenceMedium" },
            low: { icon: "○", className: "low", textKey: "tmi.confidenceLow" },
            none: { icon: "?", className: "none", textKey: "tmi.confidenceNone" }
        };

        const config = badgeConfig[confidence] || badgeConfig.none;
        // Show verified + related count out of total
        const verifiedRelatedCount = (verified_source_count || 0) + (related_source_count || 0);
        const sourceInfo = total_source_count > 0
            ? ` (${verifiedRelatedCount}/${total_source_count})`
            : '';

        return react.createElement("span", {
            className: `tmi-reliability-badge ${config.className}`,
            title: I18n.t(config.textKey) + sourceInfo
        },
            react.createElement("span", { className: "tmi-badge-icon" }, config.icon),
            react.createElement("span", { className: "tmi-badge-text" },
                I18n.t(config.textKey)
            )
        );
    };

    // Full TMI View Component (replaces left panel content)
    const TMIFullView = react.memo(({ info, onClose, trackName, artistName, coverUrl, onRegenerate, tmiScale: propTmiScale }) => {
        // prop으로 받은 tmiScale 사용, 없으면 CONFIG에서 가져옴
        const tmiScale = propTmiScale ?? (CONFIG?.visual?.["fullscreen-tmi-font-size"] || 100) / 100;

        // Handle error state
        if (info?.error) {
            const isQuotaError = info.message?.includes('429') || info.message?.includes('quota') || info.message?.includes('RESOURCE_EXHAUSTED');
            return react.createElement("div", {
                className: "tmi-fullview tmi-fullview-error",
                style: { "--tmi-scale": tmiScale }
            },
                react.createElement("div", { className: "tmi-fullview-header" },
                    coverUrl && react.createElement("img", {
                        src: coverUrl,
                        className: "tmi-fullview-cover"
                    }),
                    react.createElement("div", { className: "tmi-fullview-info" },
                        react.createElement("span", { className: "tmi-fullview-label" }, I18n.t("tmi.title")),
                        react.createElement("h2", { className: "tmi-fullview-track" }, trackName),
                        react.createElement("p", { className: "tmi-fullview-artist" }, artistName)
                    )
                ),
                react.createElement("div", { className: "tmi-fullview-content tmi-error-content" },
                    react.createElement("div", { className: "tmi-error-icon" }, "⚠️"),
                    react.createElement("p", { className: "tmi-error-message" },
                        isQuotaError ? I18n.t("tmi.errorQuota") : I18n.t("tmi.errorFetch")
                    ),
                    isQuotaError && react.createElement("p", { className: "tmi-error-hint" }, I18n.t("tmi.errorQuotaHint"))
                ),
                react.createElement("div", { className: "tmi-fullview-footer" },
                    onRegenerate && react.createElement("button", {
                        className: "tmi-btn-regenerate",
                        onClick: onRegenerate,
                        title: I18n.t("tmi.regenerate")
                    },
                        react.createElement("span", { style: { fontSize: "18px", lineHeight: 1 } }, "↻")
                    ),
                    react.createElement("button", {
                        className: "tmi-btn-close",
                        onClick: onClose
                    },
                        react.createElement("span", null, "✕"),
                        react.createElement("span", null, I18n.t("tmi.close"))
                    )
                )
            );
        }

        const track = info?.track || {};
        const triviaList = track.trivia || [];
        const description = track.description || '';

        // New API structure: sources are in track.sources.verified, track.sources.related, and track.sources.other
        const sources = track.sources || {};
        const verifiedSources = sources.verified || [];
        const relatedSources = sources.related || [];
        const otherSources = sources.other || [];
        const allSources = [...verifiedSources, ...relatedSources, ...otherSources];

        // Reliability info from new API structure
        const reliability = track.reliability || {};

        return react.createElement("div", {
            className: "tmi-fullview",
            style: { "--tmi-scale": tmiScale }
        },
            // Header
            react.createElement("div", { className: "tmi-fullview-header" },
                coverUrl && react.createElement("img", {
                    src: coverUrl,
                    className: "tmi-fullview-cover"
                }),
                react.createElement("div", { className: "tmi-fullview-info" },
                    react.createElement("div", { className: "tmi-header-top" },
                        react.createElement("span", { className: "tmi-fullview-label" }, I18n.t("tmi.title"))
                    ),
                    react.createElement("h2", { className: "tmi-fullview-track" }, trackName),
                    react.createElement("p", { className: "tmi-fullview-artist" }, artistName)
                )
            ),

            // Content - scrollable area
            react.createElement("div", { className: "tmi-fullview-content" },
                // Description with reliability badge
                description && react.createElement("div", {
                    className: `tmi-fullview-description ${reliability.confidence || ''}`
                },
                    react.createElement("p", null, renderMarkdown(description))
                ),

                // All Trivia items
                triviaList.length > 0 && react.createElement("div", { className: "tmi-fullview-trivia-list" },
                    react.createElement("div", { className: "tmi-fullview-trivia-label" },
                        I18n.t("tmi.didYouKnow")
                    ),
                    triviaList.map((item, i) => react.createElement("div", {
                        key: i,
                        className: "tmi-fullview-trivia-item"
                    },
                        react.createElement("div", { className: "tmi-trivia-content" },
                            react.createElement("span", { className: "tmi-trivia-bullet" }, "✦"),
                            react.createElement("div", { className: "tmi-trivia-body" },
                                react.createElement("span", { className: "tmi-trivia-text" }, renderMarkdown(item))
                            )
                        )
                    ))
                ),

                // Sources section at the bottom
                allSources.length > 0 && react.createElement("div", { className: "tmi-sources-section" },
                    react.createElement("div", { className: "tmi-sources-header" },
                        react.createElement("span", { className: "tmi-sources-label" }, I18n.t("tmi.sources")),
                        react.createElement(ReliabilityBadge, { reliability })
                    ),
                    // Verified sources
                    verifiedSources.length > 0 && react.createElement("div", { className: "tmi-sources-group verified" },
                        react.createElement("span", { className: "tmi-sources-group-label" },
                            I18n.t("tmi.verifiedSources") + ` (${verifiedSources.length})`
                        ),
                        renderSourceLinks(verifiedSources, true)
                    ),
                    // Related sources
                    relatedSources.length > 0 && react.createElement("div", { className: "tmi-sources-group related" },
                        react.createElement("span", { className: "tmi-sources-group-label" },
                            I18n.t("tmi.relatedSources") + ` (${relatedSources.length})`
                        ),
                        renderSourceLinks(relatedSources, false)
                    ),
                    // Other sources
                    otherSources.length > 0 && react.createElement("div", { className: "tmi-sources-group other" },
                        react.createElement("span", { className: "tmi-sources-group-label" },
                            I18n.t("tmi.otherSources") + ` (${otherSources.length})`
                        ),
                        renderSourceLinks(otherSources, false)
                    )
                ),

                // No data fallback
                !description && triviaList.length === 0 && react.createElement("div", { className: "tmi-fullview-empty" },
                    react.createElement("p", null, I18n.t("tmi.noData"))
                )
            ),

            // Footer with buttons
            react.createElement("div", { className: "tmi-fullview-footer" },
                onRegenerate && react.createElement("button", {
                    className: "tmi-btn-regenerate",
                    onClick: onRegenerate,
                    title: I18n.t("tmi.regenerate")
                },
                    react.createElement("span", { style: { fontSize: "18px", lineHeight: 1 } }, "↻")
                ),
                react.createElement("button", {
                    className: "tmi-btn-close",
                    onClick: onClose
                },
                    react.createElement("span", null, "✕"),
                    react.createElement("span", null, I18n.t("tmi.close"))
                )
            )
        );
    });

    // Loading View
    const TMILoadingView = react.memo(({ onClose, tmiScale: propTmiScale }) => {
        // prop으로 받은 tmiScale 사용, 없으면 CONFIG에서 가져옴
        const tmiScale = propTmiScale ?? (CONFIG?.visual?.["fullscreen-tmi-font-size"] || 100) / 100;

        return react.createElement("div", {
            className: "tmi-fullview tmi-fullview-loading",
            style: { "--tmi-scale": tmiScale }
        },
            react.createElement("div", { className: "tmi-fullview-header" },
                react.createElement("span", { className: "tmi-fullview-label" }, I18n.t("tmi.title"))
            ),
            react.createElement("div", { className: "tmi-fullview-content tmi-loading-content" },
                react.createElement("div", { className: "tmi-loading-spinner" }),
                react.createElement("p", null, I18n.t("tmi.loading"))
            ),
            react.createElement("div", { className: "tmi-fullview-footer" },
                react.createElement("button", {
                    className: "tmi-fullview-close-btn",
                    onClick: onClose
                },
                    react.createElement("span", null, "✕"),
                    react.createElement("span", null, I18n.t("tmi.cancel"))
                )
            )
        );
    });

    return { TMIFullView, TMILoadingView, fetchSongInfo, tmiCache };
})();

// Register globally
window.SongInfoTMI = SongInfoTMI;
