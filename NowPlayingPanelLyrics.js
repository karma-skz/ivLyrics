// ============================================
// NowPlayingPanelLyrics.js
// 우측 패널 (Now Playing View)에 가사를 표시하는 모듈
// ============================================

(function NowPlayingPanelLyricsModule() {
    "use strict";

    // Spicetify가 준비될 때까지 대기
    if (!window.Spicetify || !Spicetify.React || !Spicetify.ReactDOM) {
        setTimeout(NowPlayingPanelLyricsModule, 300);
        return;
    }

    const react = Spicetify.React;
    const { useState, useEffect, useRef, useCallback, useMemo } = react;

    // 설정 키
    const STORAGE_KEY = "ivLyrics:visual:panel-lyrics-enabled";
    const PANEL_LINES_KEY = "ivLyrics:visual:panel-lyrics-lines";

    // 기본 설정값
    const DEFAULT_ENABLED = true;
    const DEFAULT_LINES = 5; // 표시할 가사 줄 수 (위 2, 현재 1, 아래 2)

    // 패널 가사 컨테이너 CSS 클래스
    const PANEL_CONTAINER_CLASS = "ivlyrics-panel-lyrics-container";
    const PANEL_SECTION_CLASS = "ivlyrics-panel-lyrics-section";

    // Observer 참조
    let panelObserver = null;
    let lyricsRoot = null;

    // 현재 가사 상태
    let currentLyricsState = {
        lyrics: [],
        currentIndex: 0,
        isPlaying: false,
        trackUri: null
    };

    // ============================================
    // 유틸리티 함수
    // ============================================
    const getStorageValue = (key, defaultValue) => {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return defaultValue;
            if (value === "true") return true;
            if (value === "false") return false;
            const num = parseInt(value, 10);
            if (!isNaN(num)) return num;
            return value;
        } catch {
            return defaultValue;
        }
    };

    const setStorageValue = (key, value) => {
        try {
            localStorage.setItem(key, String(value));
        } catch (e) {
            console.error("[NowPlayingPanelLyrics] Storage error:", e);
        }
    };

    // ============================================
    // 가사 라인 컴포넌트
    // ============================================
    const LyricLine = ({ text, isActive, isPast, translation, phonetic }) => {
        const lineClass = `ivlyrics-panel-line ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`;
        
        return react.createElement("div", { className: lineClass },
            // 발음 (위에 작게)
            phonetic && react.createElement("div", { 
                className: "ivlyrics-panel-line-phonetic" 
            }, phonetic),
            // 원문 가사
            react.createElement("div", { 
                className: "ivlyrics-panel-line-text",
                dangerouslySetInnerHTML: text ? { __html: text } : undefined
            }, text ? undefined : " "),
            // 번역 (아래에)
            translation && react.createElement("div", { 
                className: "ivlyrics-panel-line-translation" 
            }, translation)
        );
    };

    // ============================================
    // 패널 가사 메인 컴포넌트
    // ============================================
    const PanelLyrics = () => {
        const [lyrics, setLyrics] = useState([]);
        const [currentIndex, setCurrentIndex] = useState(0);
        const [isEnabled, setIsEnabled] = useState(getStorageValue(STORAGE_KEY, DEFAULT_ENABLED));
        const [numLines, setNumLines] = useState(parseInt(getStorageValue(PANEL_LINES_KEY, DEFAULT_LINES), 10));
        const containerRef = useRef(null);
        const scrollRef = useRef(null);
        const animationRef = useRef(null);

        // 가사 업데이트 리스너
        useEffect(() => {
            // index.js에서 발생하는 ivLyrics:lyrics-ready 이벤트 수신
            const handleLyricsReady = (event) => {
                if (event.detail?.lyrics) {
                    console.log("[PanelLyrics] Received lyrics:", event.detail.lyrics.length);
                    setLyrics(event.detail.lyrics);
                    currentLyricsState.lyrics = event.detail.lyrics;
                    currentLyricsState.trackUri = event.detail.trackInfo?.uri;
                }
            };

            // index.js에서 발생하는 ivLyrics:lyric-index-changed 이벤트 수신
            const handleIndexUpdate = (event) => {
                if (typeof event.detail?.index === 'number') {
                    setCurrentIndex(event.detail.index);
                    currentLyricsState.currentIndex = event.detail.index;
                }
            };

            const handleSettingsChange = (event) => {
                if (event.detail?.name === 'panel-lyrics-enabled') {
                    setIsEnabled(event.detail.value);
                }
                if (event.detail?.name === 'panel-lyrics-lines') {
                    setNumLines(parseInt(event.detail.value, 10) || DEFAULT_LINES);
                }
            };

            window.addEventListener('ivLyrics:lyrics-ready', handleLyricsReady);
            window.addEventListener('ivLyrics:lyric-index-changed', handleIndexUpdate);
            window.addEventListener('ivLyrics', handleSettingsChange);

            return () => {
                window.removeEventListener('ivLyrics:lyrics-ready', handleLyricsReady);
                window.removeEventListener('ivLyrics:lyric-index-changed', handleIndexUpdate);
                window.removeEventListener('ivLyrics', handleSettingsChange);
            };
        }, []);

        // 현재 재생 위치 추적 (백업용 - 이벤트가 오지 않는 경우)
        useEffect(() => {
            const updatePosition = () => {
                if (!lyrics || lyrics.length === 0) return;

                const position = Spicetify.Player.getProgress();
                const delay = parseInt(getStorageValue('ivLyrics:visual:delay', '0'), 10) || 0;
                const adjustedPosition = position + delay;

                // 현재 라인 찾기
                let newIndex = 0;
                for (let i = 0; i < lyrics.length; i++) {
                    if (lyrics[i].startTime !== undefined && lyrics[i].startTime <= adjustedPosition) {
                        newIndex = i;
                    } else if (lyrics[i].startTime > adjustedPosition) {
                        break;
                    }
                }

                if (newIndex !== currentIndex) {
                    setCurrentIndex(newIndex);
                }

                animationRef.current = requestAnimationFrame(updatePosition);
            };

            if (isEnabled && lyrics.length > 0) {
                animationRef.current = requestAnimationFrame(updatePosition);
            }

            return () => {
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
            };
        }, [lyrics, isEnabled, currentIndex]);

        // 스크롤 애니메이션
        useEffect(() => {
            if (!scrollRef.current || !isEnabled) return;

            const activeElement = scrollRef.current.querySelector('.ivlyrics-panel-line.active');
            if (activeElement) {
                activeElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }, [currentIndex, isEnabled]);

        // 표시할 가사 라인들 계산
        const visibleLines = useMemo(() => {
            if (!lyrics || lyrics.length === 0) return [];

            const halfLines = Math.floor(numLines / 2);
            const startIdx = Math.max(0, currentIndex - halfLines);
            const endIdx = Math.min(lyrics.length, currentIndex + halfLines + 1);

            const lines = [];
            for (let i = startIdx; i < endIdx; i++) {
                const line = lyrics[i];
                // originalText, text, text2 등 다양한 필드 지원
                const mainText = line?.originalText || line?.text || '';
                const translation = line?.text2 || line?.translation || '';
                // phonetic: text와 originalText가 다르면 text가 발음일 수 있음
                let phonetic = '';
                if (line?.text && line?.originalText && line.text !== line.originalText) {
                    phonetic = line.text;
                }
                
                lines.push({
                    index: i,
                    text: mainText,
                    translation: translation,
                    phonetic: phonetic,
                    isActive: i === currentIndex,
                    isPast: i < currentIndex
                });
            }

            return lines;
        }, [lyrics, currentIndex, numLines]);

        // 비활성화 또는 가사 없음
        if (!isEnabled) return null;
        if (!lyrics || lyrics.length === 0) {
            return react.createElement("div", { 
                className: PANEL_SECTION_CLASS,
                ref: containerRef
            },
                react.createElement("div", { className: "ivlyrics-panel-header" },
                    react.createElement("h2", null, "Lyrics")
                ),
                react.createElement("div", { className: "ivlyrics-panel-empty" },
                    "가사를 불러오는 중..."
                )
            );
        }

        return react.createElement("div", { 
            className: PANEL_SECTION_CLASS,
            ref: containerRef
        },
            // 헤더
            react.createElement("div", { className: "ivlyrics-panel-header" },
                react.createElement("h2", null, "Lyrics")
            ),
            // 가사 컨테이너
            react.createElement("div", { 
                className: "ivlyrics-panel-lyrics-wrapper",
                ref: scrollRef
            },
                visibleLines.map((line, idx) => 
                    react.createElement(LyricLine, {
                        key: `${line.index}-${idx}`,
                        text: line.text,
                        isActive: line.isActive,
                        isPast: line.isPast,
                        translation: line.translation,
                        phonetic: line.phonetic
                    })
                )
            )
        );
    };

    // ============================================
    // 패널 감지 및 삽입
    // ============================================
    const findNowPlayingPanel = () => {
        // Spotify의 Now Playing View 패널 찾기
        // 여러 가지 선택자 시도
        const selectors = [
            '.main-nowPlayingView-section',
            '[data-testid="NPV_Panel_OpenDiv"]',
            '.main-nowPlayingWidget-nowPlayingWidget',
            '.iHa_q9pq4un3VNRQgwTx'
        ];

        for (const selector of selectors) {
            const panel = document.querySelector(selector);
            if (panel) {
                return panel.closest('.main-nowPlayingView-nowPlayingGrid') 
                    || panel.closest('.main-nowPlayingView-nowPlayingWidget')
                    || panel.parentElement;
            }
        }

        return null;
    };

    const insertPanelLyrics = () => {
        // 이미 존재하면 스킵
        if (document.querySelector(`.${PANEL_CONTAINER_CLASS}`)) {
            return;
        }

        const panel = findNowPlayingPanel();
        if (!panel) {
            return;
        }

        // 컨테이너 생성
        const container = document.createElement('div');
        container.className = PANEL_CONTAINER_CLASS;

        // 크레딧 섹션 앞에 삽입 (또는 패널 끝에)
        const creditsSection = panel.querySelector('.main-nowPlayingView-credits');
        if (creditsSection) {
            creditsSection.parentNode.insertBefore(container, creditsSection);
        } else {
            panel.appendChild(container);
        }

        // React 렌더링
        try {
            const ReactDOM = Spicetify.ReactDOM;
            if (ReactDOM.createRoot) {
                // React 18+
                lyricsRoot = ReactDOM.createRoot(container);
                lyricsRoot.render(react.createElement(PanelLyrics));
            } else {
                // React 17 이하
                ReactDOM.render(react.createElement(PanelLyrics), container);
                lyricsRoot = container;
            }
            console.log("[NowPlayingPanelLyrics] Panel lyrics inserted successfully");
        } catch (error) {
            console.error("[NowPlayingPanelLyrics] Failed to render:", error);
        }
    };

    const removePanelLyrics = () => {
        const container = document.querySelector(`.${PANEL_CONTAINER_CLASS}`);
        if (container) {
            try {
                if (lyricsRoot && typeof lyricsRoot.unmount === 'function') {
                    lyricsRoot.unmount();
                } else {
                    Spicetify.ReactDOM.unmountComponentAtNode(container);
                }
            } catch (e) {
                // Ignore unmount errors
            }
            container.remove();
            lyricsRoot = null;
        }
    };

    // ============================================
    // MutationObserver 설정
    // ============================================
    const setupObserver = () => {
        if (panelObserver) {
            panelObserver.disconnect();
        }

        panelObserver = new MutationObserver((mutations) => {
            // 패널이 열렸는지 확인
            const panel = findNowPlayingPanel();
            const container = document.querySelector(`.${PANEL_CONTAINER_CLASS}`);

            if (panel && !container) {
                // 패널이 있지만 가사가 없으면 삽입
                setTimeout(insertPanelLyrics, 100);
            } else if (!panel && container) {
                // 패널이 없지만 컨테이너가 있으면 제거
                removePanelLyrics();
            }
        });

        // body 전체 감시 (패널이 동적으로 생성됨)
        panelObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    };

    // ============================================
    // 가사 데이터 수신 및 전달
    // ============================================
    const setupLyricsListener = () => {
        // 트랙 변경 감지
        Spicetify.Player.addEventListener('songchange', () => {
            currentLyricsState.lyrics = [];
            currentLyricsState.currentIndex = 0;
            currentLyricsState.trackUri = Spicetify.Player.data?.item?.uri;
        });
    };

    // ============================================
    // 초기화
    // ============================================
    const init = () => {
        console.log("[NowPlayingPanelLyrics] Initializing...");

        // 설정 체크
        const isEnabled = getStorageValue(STORAGE_KEY, DEFAULT_ENABLED);
        if (!isEnabled) {
            console.log("[NowPlayingPanelLyrics] Disabled by settings");
            return;
        }

        // Observer 설정
        setupObserver();

        // 가사 리스너 설정
        setupLyricsListener();

        // 초기 삽입 시도
        setTimeout(insertPanelLyrics, 1000);

        // 설정 변경 리스너
        window.addEventListener('ivLyrics', (event) => {
            if (event.detail?.name === 'panel-lyrics-enabled') {
                if (event.detail.value) {
                    setupObserver();
                    insertPanelLyrics();
                } else {
                    if (panelObserver) panelObserver.disconnect();
                    removePanelLyrics();
                }
            }
        });

        console.log("[NowPlayingPanelLyrics] Initialized successfully");
    };

    // 초기화 실행
    init();

    // 전역 접근용 (디버깅/설정)
    window.NowPlayingPanelLyrics = {
        insert: insertPanelLyrics,
        remove: removePanelLyrics,
        isEnabled: () => getStorageValue(STORAGE_KEY, DEFAULT_ENABLED),
        setEnabled: (enabled) => {
            setStorageValue(STORAGE_KEY, enabled);
            if (enabled) {
                insertPanelLyrics();
            } else {
                removePanelLyrics();
            }
        },
        updateLyrics: (lyrics, index) => {
            currentLyricsState.lyrics = lyrics || [];
            currentLyricsState.currentIndex = index || 0;
            window.dispatchEvent(new CustomEvent('ivlyrics-panel-lyrics-update', {
                detail: {
                    lyrics: currentLyricsState.lyrics,
                    currentIndex: currentLyricsState.currentIndex
                }
            }));
        }
    };

})();
