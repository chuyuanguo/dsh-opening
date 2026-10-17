/**
 * DSH / OPENING — browser half.
 *
 * Reads the Host state document once, then mounts a frame-wide overlay that
 * plays the released 19.5 s opening film. The film starts by itself once per
 * app session (fresh tab / fresh window), can be skipped, unmutes on the first
 * pointer interaction when autoplay-with-sound is refused, and can be replayed
 * from Settings → General.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-opening',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-opening'
    const STATE_URL = '/dsh-opening/state.json'
    const SEEN_SESSION = 'dsh-opening:seen:session'
    const SEEN_ONCE = 'dsh-opening:seen:once'
    const SEEN_DAY = 'dsh-opening:seen:day'

    const EN = {
      label: 'Opening film',
      aria: 'DeepSeek Harness opening film',
      skip: 'Skip',
      play: 'Play the opening',
      soundOff: 'Sound off — click to unmute',
      settingsTitle: 'Opening film',
      settingsDesc: 'Plays the 19.5-second DSH opening when the app starts.',
      replay: 'Play again',
    }
    const ZH = {
      label: '开场片',
      aria: 'DeepSeek Harness 开场片',
      skip: '跳过',
      play: '播放开场片',
      soundOff: '声音已关闭 · 点击开启',
      settingsTitle: '开场动画',
      settingsDesc: '启动时播放 19.5 秒的 DSH 开场片。',
      replay: '重新播放',
    }

    const FILM_CSS = `
.dsh-opening{position:fixed;inset:0;z-index:2147483600;background:#000;color:#f4f1ea;font-family:Montserrat,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;opacity:1;transition:opacity 620ms cubic-bezier(.4,0,.2,1)}
.dsh-opening[data-leaving="true"]{opacity:0}
.dsh-opening__video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block}
.dsh-opening__gate{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:#f4f1ea;cursor:pointer}
.dsh-opening__play{display:flex;align-items:center;justify-content:center;width:76px;height:76px;border-radius:50%;border:1px solid rgba(244,241,234,.5);background:rgba(0,0,0,.32);backdrop-filter:blur(6px);transition:background 200ms ease,border-color 200ms ease,transform 200ms ease}
.dsh-opening__gate:hover .dsh-opening__play{background:rgba(244,241,234,.12);border-color:rgba(244,241,234,.9);transform:scale(1.04)}
.dsh-opening__gate:focus-visible{outline:none}
.dsh-opening__gate:focus-visible .dsh-opening__play{border-color:#f4f1ea;box-shadow:0 0 0 3px rgba(244,241,234,.28)}
.dsh-opening__skip{position:absolute;top:22px;right:22px;z-index:3;padding:9px 17px;border-radius:999px;border:1px solid rgba(244,241,234,.22);background:rgba(0,0,0,.28);color:rgba(244,241,234,.68);font-family:inherit;font-size:11px;font-weight:500;line-height:1;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;opacity:0;transform:translateY(-4px);transition:opacity 480ms ease,transform 480ms ease,color 180ms ease,border-color 180ms ease,background 180ms ease;backdrop-filter:blur(8px)}
.dsh-opening[data-ready="true"] .dsh-opening__skip{opacity:1;transform:none}
.dsh-opening__skip:hover{color:#f4f1ea;border-color:rgba(244,241,234,.55);background:rgba(0,0,0,.44)}
.dsh-opening__skip:focus-visible{outline:2px solid rgba(244,241,234,.72);outline-offset:3px}
.dsh-opening__hint{position:absolute;left:24px;bottom:20px;z-index:3;font-family:inherit;font-size:11px;font-weight:500;line-height:1.4;letter-spacing:.06em;color:rgba(244,241,234,.55);opacity:0;transition:opacity 480ms ease;pointer-events:none}
.dsh-opening[data-ready="true"] .dsh-opening__hint{opacity:1}
.dsh-opening__rail{position:absolute;left:0;right:0;bottom:0;z-index:3;height:2px;background:rgba(244,241,234,.1)}
.dsh-opening__railFill{height:100%;width:0;background:rgba(244,241,234,.62);transition:width 180ms linear}
@media (prefers-reduced-motion:reduce){.dsh-opening,.dsh-opening__skip,.dsh-opening__hint,.dsh-opening__railFill,.dsh-opening__play{transition:none !important}}
`

    const ROW_CSS = `
.dsh-opening-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0}
.dsh-opening-row__text{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsh-opening-row__title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsh-opening-row__desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-opening-row__btn{flex:none;height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1;cursor:pointer;transition:background 160ms ease,border-color 160ms ease}
.dsh-opening-row__btn:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-opening-row__btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
`

    /** Manual replay requests; the overlay host stays registered and listens. */
    const replayListeners = new Set()
    function requestPlay() {
      for (const listener of Array.from(replayListeners)) {
        try {
          listener()
        } catch (error) {
          /* one broken listener must not stop the others */
        }
      }
    }

    function prefersReducedMotion() {
      try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
          : false
      } catch (error) {
        return false
      }
    }

    function storageArea(kind) {
      try {
        if (typeof window === 'undefined') return null
        return kind === 'local' ? window.localStorage : window.sessionStorage
      } catch (error) {
        return null
      }
    }

    function readValue(key, storage) {
      try {
        return storage ? storage.getItem(key) : null
      } catch (error) {
        return null
      }
    }

    function writeValue(key, value, storage) {
      try {
        if (storage) storage.setItem(key, value)
      } catch (error) {
        /* storage can be unavailable; the film still plays */
      }
    }

    function todayKey() {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      return `${now.getFullYear()}-${month}-${day}`
    }

    function frequencyOf(state) {
      return state && typeof state.frequency === 'string' ? state.frequency : 'session'
    }

    function shouldAutoPlay(state) {
      if (!state || state.autoplay === false) return false
      const frequency = frequencyOf(state)
      if (frequency === 'always') return true
      if (frequency === 'once') return readValue(SEEN_ONCE, storageArea('local')) !== '1'
      if (frequency === 'daily') return readValue(SEEN_DAY, storageArea('local')) !== todayKey()
      return readValue(SEEN_SESSION, storageArea('session')) !== '1'
    }

    function markSeen(state) {
      const frequency = frequencyOf(state)
      if (frequency === 'always') return
      if (frequency === 'once') {
        writeValue(SEEN_ONCE, '1', storageArea('local'))
        return
      }
      if (frequency === 'daily') {
        writeValue(SEEN_DAY, todayKey(), storageArea('local'))
        return
      }
      writeValue(SEEN_SESSION, '1', storageArea('session'))
    }

    function clampVolume(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return 0.85
      return Math.min(1, Math.max(0, number))
    }

    function OpeningFilm({ state, t, onClose }) {
      const videoRef = React.useRef(null)
      const closedRef = React.useRef(false)
      const timerRef = React.useRef(0)
      const [leaving, setLeaving] = React.useState(false)
      const [done, setDone] = React.useState(false)
      const [muted, setMuted] = React.useState(false)
      const [gated, setGated] = React.useState(() => prefersReducedMotion())
      const [progress, setProgress] = React.useState(0)
      const [ready, setReady] = React.useState(false)

      const finish = React.useCallback(() => {
        if (closedRef.current) return
        closedRef.current = true
        markSeen(state)
        setLeaving(true)
        timerRef.current = window.setTimeout(() => {
          setDone(true)
          onClose()
        }, 620)
      }, [state, onClose])

      const start = React.useCallback(() => {
        setGated(false)
        const video = videoRef.current
        if (!video) return
        video.volume = clampVolume(state.volume)
        video.muted = false
        setMuted(false)
        const attempt = video.play()
        if (attempt && typeof attempt.catch === 'function') {
          attempt.catch(() => {
            video.muted = true
            setMuted(true)
            const retry = video.play()
            if (retry && typeof retry.catch === 'function') {
              retry.catch(() => setGated(true))
            }
          })
        }
      }, [state.volume])

      React.useEffect(() => {
        const root = document.documentElement
        const previous = root.style.overflow
        root.style.overflow = 'hidden'
        return () => {
          root.style.overflow = previous
        }
      }, [])

      React.useEffect(() => {
        const timer = window.setTimeout(() => setReady(true), 900)
        return () => window.clearTimeout(timer)
      }, [])

      React.useEffect(() => () => window.clearTimeout(timerRef.current), [])

      React.useEffect(() => {
        if (gated) return undefined
        const video = videoRef.current
        if (!video) return undefined
        let cancelled = false
        video.volume = clampVolume(state.volume)
        video.muted = false
        setMuted(false)
        const attempt = video.play()
        if (attempt && typeof attempt.catch === 'function') {
          attempt.catch(() => {
            if (cancelled) return
            video.muted = true
            setMuted(true)
            const retry = video.play()
            if (retry && typeof retry.catch === 'function') {
              retry.catch(() => {
                if (!cancelled) setGated(true)
              })
            }
          })
        }
        return () => {
          cancelled = true
        }
      }, [gated, state.volume])

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (state.allowSkip === false) return
          event.preventDefault()
          event.stopPropagation()
          finish()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [finish, state.allowSkip])

      /** Safety net: a full-frame overlay must never outlive the film, even if
       * the media element stops reporting `ended` (stalled decoder, hidden tab). */
      React.useEffect(() => {
        if (gated) return undefined
        const seconds = Number(state.film && state.film.durationSeconds)
        const limit = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 4000 : 60000
        const timer = window.setTimeout(() => finish(), limit)
        return () => window.clearTimeout(timer)
      }, [gated, finish, state.film])

      if (done) return null

      const onPointerDown = () => {
        const video = videoRef.current
        if (!video) return
        if (gated) {
          start()
          return
        }
        if (video.muted) {
          video.muted = false
          video.volume = clampVolume(state.volume)
          setMuted(false)
        }
      }

      const onTimeUpdate = (event) => {
        const video = event.currentTarget
        const duration = video.duration
        if (!Number.isFinite(duration) || duration <= 0) return
        setProgress(Math.min(1, Math.max(0, video.currentTime / duration)))
      }

      return h(
        'div',
        {
          key: 'film',
          className: 'dsh-opening',
          'data-leaving': leaving ? 'true' : 'false',
          'data-ready': ready ? 'true' : 'false',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('aria'),
          onPointerDownCapture: onPointerDown,
          style: { pointerEvents: 'auto' },
        },
        h('style', { key: 'css' }, FILM_CSS),
        h('video', {
          key: 'video',
          ref: videoRef,
          className: 'dsh-opening__video',
          src: state.video && state.video.src,
          poster: state.poster,
          preload: 'auto',
          playsInline: true,
          onTimeUpdate,
          onEnded: finish,
          onError: finish,
        }),
        gated
          ? h(
              'button',
              {
                key: 'gate',
                type: 'button',
                className: 'dsh-opening__gate',
                onClick: start,
                'aria-label': t('play'),
              },
              h(
                'span',
                { className: 'dsh-opening__play' },
                h(
                  'svg',
                  { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
                  h('path', { d: 'M9 6.5 L18 12 L9 17.5 Z', fill: 'currentColor' }),
                ),
              ),
            )
          : null,
        state.allowSkip === false
          ? null
          : h('button', { key: 'skip', type: 'button', className: 'dsh-opening__skip', onClick: finish }, t('skip')),
        h(
          'div',
          { key: 'rail', className: 'dsh-opening__rail', 'aria-hidden': 'true' },
          h('div', { className: 'dsh-opening__railFill', style: { width: `${(progress * 100).toFixed(2)}%` } }),
        ),
        muted && !gated ? h('div', { key: 'hint', className: 'dsh-opening__hint' }, t('soundOff')) : null,
      )
    }

    function OpeningHost({ state, auto, t }) {
      const [playing, setPlaying] = React.useState(auto)

      React.useEffect(() => {
        const listener = () => setPlaying(true)
        replayListeners.add(listener)
        return () => {
          replayListeners.delete(listener)
        }
      }, [])

      if (!playing) return null
      return h(OpeningFilm, { state, t, onClose: () => setPlaying(false) })
    }

    function SettingsRow({ t }) {
      return h(
        React.Fragment,
        null,
        h('style', { key: 'css' }, ROW_CSS),
        h(
          'div',
          { key: 'row', className: 'dsh-opening-row' },
          h(
            'div',
            { className: 'dsh-opening-row__text' },
            h('div', { className: 'dsh-opening-row__title' }, t('settingsTitle')),
            h('div', { className: 'dsh-opening-row__desc' }, t('settingsDesc')),
          ),
          h(
            'button',
            { type: 'button', className: 'dsh-opening-row__btn', onClick: () => requestPlay() },
            t('replay'),
          ),
        ),
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-opening: dictionaries')
      const t = ctx.locale.bind(NS)

      const controller = typeof AbortController === 'function' ? new AbortController() : null
      let disposed = false
      ctx.effect(
        () => () => {
          disposed = true
          if (controller) controller.abort()
        },
        'dsh-opening: state request',
      )

      const request = controller ? { cache: 'no-store', signal: controller.signal } : { cache: 'no-store' }
      fetch(STATE_URL, request)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .then((state) => {
          if (disposed || !state || !state.video || !state.video.src) return
          const auto = shouldAutoPlay(state)
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register(
              { name: 'shell.overlay', id: 'dsh-opening', order: 50, label: () => t('label') },
              () => h(OpeningHost, { state, auto, t }),
            ),
          )
          ctx.slots.inject('settings.general.item', () =>
            ctx.slots.register({ name: 'settings.general.item', id: 'dsh-opening', order: 18 }, () => h(SettingsRow, { t })),
          )
        })
        .catch((error) => {
          if (!disposed) console.warn('[dsh-opening] opening state unavailable:', error && error.message)
        })
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
